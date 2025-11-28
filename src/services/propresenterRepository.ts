import { action, makeObservable, observable, runInAction } from "mobx";
import { FileReference, FolderReference, joinPath } from "./platforms";
import * as proto from '@/models/propresenter-proto';
import { ItemWrapper, ObjectType } from "./propresenterStore";
import { buildProPresenterScreen } from "./proto-builders/screenTemplate";
import { AudienceLookConfiguration } from "@/models/audienceLookConfiguration";
import { Writer } from "protobufjs";
import { TreeUpserter } from "@/lib/visitor";

const PlaylistDocument = proto.rv.data.PlaylistDocument;
export type ProPresenterPlaylist = InstanceType<typeof PlaylistDocument>;

export interface LibraryItem {
  type: 'item';
  name: string;
  id: string;
  modified: number;
  path: string;
  ref: FileReference;
}

export interface LibraryFolder {
  type: 'folder';
  name: string;
  path: string;
  ref: FolderReference;
  children: Array<LibraryFolder | LibraryItem>;
}

interface ScreenConfiguration {
  uuid: string;
  name: string;
  type: proto.rv.data.ProPresenterScreen.ScreenType;
  width: number;
  height: number;
}

export interface FileStatus {
  name: string;
  size: number;
  modified: number;
}

export class Configuration {
  @observable screens: ScreenConfiguration[] = [];
  @observable looks: AudienceLookConfiguration[] = [];

  constructor(name: string, private readonly workspace: proto.rv.data.ProPresenterWorkspace) {
    console.log(name, 'new Configuration', workspace);
    makeObservable(this);
    this.updateScreens();
    this.updateLooks();
  }

  async commit(rootDir: FolderReference): Promise<void> {
    const workspaceRef = await rootDir.getFile('Configuration/Workspace');
    const sharedArray = proto.rv.data.ProPresenterWorkspace.encode(this.workspace).finish();
    const buffer = sharedArray.slice(sharedArray.byteOffset, sharedArray.byteOffset + sharedArray.byteLength).buffer;
    await workspaceRef.putContents(buffer);
  }

  removeScreen(uuid: string): void {
    this.workspace.proScreens = this.workspace.proScreens.filter(s => s.uuid?.string !== uuid);
    this.updateScreens();
  }

  @action.bound
  private updateScreens(): void {
    this.screens = this.workspace.proScreens.map(def => {
      const screen: ScreenConfiguration = {
        uuid: def.uuid?.string ?? '',
        name: def.name ?? '',
        type: def.screenType ?? proto.rv.data.ProPresenterScreen.ScreenType.SCREEN_TYPE_UNKNOWN,
        width: def.arrangementSingle?.screens?.[0].bounds?.size?.width ?? 0,
        height: def.arrangementSingle?.screens?.[0].bounds?.size?.height ?? 0,
      }
      return screen;
    });
  }

  @action.bound
  createPlaceholderScreen(config: ScreenConfiguration): void {
    this.workspace.proScreens.push(buildProPresenterScreen(config));
  }

  @action.bound
  private updateLooks(): void {
    this.looks = this.workspace.audienceLooks.map(def => {
      const look: AudienceLookConfiguration = {
        uuid: def.uuid?.string ?? '',
        name: def.name ?? '',
        screens: def.screenLooks?.map(sl => ({
          screenUuid: sl.proScreenUuid?.string ?? '',
          propsEnabled: sl.propsEnabled,
          presentationBackgroundEnabled: sl.presentationBackgroundEnabled,
          presentationForegroundEnabled: sl.presentationForegroundEnabled,
          announcementsEnabled: sl.announcementsEnabled,
          propsLayerEnabled: sl.propsLayerEnabled,
          messagesLayerEnabled: sl.messagesLayerEnabled,
        })) ?? []
      };
      return look;
    });
  }

  @action.bound
  renameLook(uuid: string): void {
    const target = this.workspace.audienceLooks.find(f => f.uuid?.string === uuid);
    if (target) { 
      target.name = `${target.name} - local`;
    }
  }
}

export class ProPresenterRepository {
  @observable library: LibraryFolder | undefined = undefined;
  @observable playList: ProPresenterPlaylist | undefined = undefined;
  @observable mediaPlayList: ProPresenterPlaylist | undefined = undefined;
  @observable mediaAssets: FileReference[] = [];
  @observable isLoading: boolean = false;

  @observable config?: Configuration = undefined;

  private itemLookup: Record<string, ItemWrapper<unknown>> = {};
  
  constructor(readonly name: string, private rootRef: FolderReference) {
    makeObservable(this);
  }

  async insertPlaylist(_: 'shows', playlist: proto.rv.data.IPlaylist) {
    const playlistDoc = await this.getPlaylistDoc();

    const playlistList = playlistDoc.rootNode?.playlists?.playlists;
    if (!playlistList) throw new Error('playlist collection not found in playlist doc');
    TreeUpserter.upsert(playlistDoc, proto.rv.data.Playlist, playlist, playlistList);
    await this.writeProtoFile('Playlists/Library', playlistDoc, proto.rv.data.PlaylistDocument.encode);
  }

  async insertMediaReference(mediaReference: proto.rv.data.IPlaylistItem) {
    const mediaDoc = await this.getMediaDoc();
    const playlistList = mediaDoc.rootNode?.playlists?.playlists?.[0].items?.items;
    if (!playlistList) throw new Error('no media playlists found')
    playlistList.unshift(mediaReference);
    await this.writeProtoFile('Playlists/Media', mediaDoc, proto.rv.data.PlaylistDocument.encode);
  }
  
  async writeProtoFile<T>(path: string, playlistDoc: T, encode: (message: T, writer?: Writer) => Writer) {
    let sharedArray: Uint8Array | undefined;
    try {
      sharedArray = encode(playlistDoc).finish();
    } catch (err) {
      console.log('error encoding ' + path);
      console.log(err);
      throw err;
    }
    const buffer = sharedArray.slice(sharedArray.byteOffset, sharedArray.byteOffset + sharedArray.byteLength).buffer;
    const file = await this.rootRef.getFile(path, { create: true })
    try {
      await file.putContents(buffer);  
    } catch (err) {
      console.log('error writing doc to store', path);
      console.error(err);
      throw err;
    }
    
  }

  private indexPlaylist(collection: 'shows' | 'media', node: proto.rv.data.IPlaylist | null | undefined): void {
    if (!node) return;
    const key = node.uuid?.string ?? 'no-key';
    let type: ObjectType = collection === 'shows' ? 'playlist' : 'mediaInfo';
    for (const child of node.playlists?.playlists ?? []) {
      type = 'playlistFolder';
      this.indexPlaylist(collection, child);
    }
    this.itemLookup[key] = { type, store: this.name, item: node };
  }

  private async readDirectory(dirHandle: FolderReference, prefix: string = ''): Promise<LibraryFolder> {
    const folder: LibraryFolder = {
      type: 'folder',
      ref: dirHandle,
      name: dirHandle.name,
      children: [],
      path: dirHandle.relativePath,
    };
    for (const item of await dirHandle.getChildren()) {
      const id=joinPath(prefix, item.name);
      if (item.kind === 'folder' && !item.name.startsWith('.')) {
        folder.children.push(await this.readDirectory(item, id));
      } else if (item.kind === 'file' && item.name.endsWith('.pro')) {
        const libraryItem: LibraryItem = {
          id,
          type: 'item',
          ref: item,
          name: item.name,
          modified: await item.getModified(),
          path: item.relativePath,
        }
        folder.children.push(libraryItem);
        this.itemLookup[id] = { type: 'presentation', store: this.name, item };
      }
    }
    return folder;
  }

  private async listMediaAssets(): Promise<FileReference[]> {
    const assetsFolder = await this.rootRef.getFolder('Media/Assets');
    return (await assetsFolder.getChildren()).filter(f => f.kind === 'file') as FileReference[];
  }

  getItemById(id: string): ItemWrapper<unknown> | undefined {
    console.log('getItemById', JSON.parse(JSON.stringify(this.itemLookup)), id);
    const result = this.itemLookup[id];
    return result;
  }


  private async readPlaylist(relativePath: string): Promise<proto.rv.data.PlaylistDocument> {
    return this.readProtoFile(relativePath, PlaylistDocument.decode)
  }

  async readProtoFile<TDecoder>(path: string, decoder: (bytes: Uint8Array) => TDecoder): Promise<TDecoder> {
    const playlistFileRef = this.rootRef.getFile(path);
    const buffer = await (await playlistFileRef).getContents();
    return decoder(new Uint8Array(buffer));
  }

  async resolvePath(url: proto.rv.data.IURL|null|undefined): Promise<string|undefined> {
    if (!url) {
      return undefined;
    }
    if (url?.local?.root === proto.rv.data.URL.LocalRelativePath.Root.ROOT_SHOW) {
      return url.local.path!;
    }
    throw new Error('cant resolve path' + JSON.stringify(url));
  }

  async commitConfig(): Promise<void> {
    if (!this.config) {
      return;
    }

    await this.config.commit(this.rootRef);
    await this.loadConfiguration();
  }

  async getFilesStatus(filesList: string[]) {
    const fileStatus: Array<FileStatus & { exists: boolean }> = [];
    const folderContents: Record<string, Array<FileStatus>> = {};
    for (const filename of filesList) {
      const idx = filename.lastIndexOf('/');
      const folder = filename.substring(0, idx);
      //const name = filename.substring(idx + 1);
      let folderList = folderContents[folder];
      if (!folderList) {
        folderList = await this.listFiles(folder);
        folderContents[folder] = folderList;
      }
      console.log('aa', filename, folder, folderList);
      if (!fileStatus.find(f => f.name === filename)) {
        console.log('bb');
        const file = folderList.find(f => f.name === filename);
        console.log('cc', file);
        fileStatus.push({
          name: filename,
          exists: !!file,
          size: file?.size ?? 0,
          modified: file?.modified ?? 0,
        });
      }
    }
          console.log('folderContents', folderContents);
    return fileStatus;
  }

  async listFiles(relativePath: string, recursive = false): Promise<FileStatus[]> {
    const list: FileStatus[] = [];
    try {
      const folder = await this.rootRef.getFolder(relativePath);
      for (const child of await folder.getChildren()) {
        const name = joinPath(relativePath, child.name);
        if (child.kind === 'folder') {
          if (recursive) list.push(...await this.listFiles(name))
          continue;
        }

        list.push({
          name,
          size: await child.getSize(),
          modified: await child.getModified(),
        });
      }
    } catch (err) {
      console.log(err);
    }
    return list;
  }

  async *downloadFolder(relativePath: string): AsyncGenerator<{path:string, size: number, stream: ReadableStream<Uint8Array>}> {
    const folder = await this.rootRef.getFolder(relativePath);
    for (const child of await folder.getChildren()) {
      if (child.kind === 'file') {
        yield { path: child.relativePath, size: await child.getSize(), stream: await child.getStream()};
      } else {
        yield* this.downloadFolder(joinPath(relativePath, child.name));
      }
    }
  }

  async getFileStream(relativePath: string): Promise<ReadableStream<Uint8Array>> {
    const file = await this.rootRef.getFile(relativePath);
    return file.getStream();
  }

  async uploadFile(relativePath: string, stream: ReadableStream<Uint8Array>, progress?: (bytes: number) => void): Promise<void> {
    const file = await this.rootRef.getFile(relativePath, { create: true });
    await file.putStream(stream, progress);
  }
  
  // async loadShow(playlist: proto.rv.data.IPlaylist): Promise<Show> {
  //   if (playlist.type !== proto.rv.data.Playlist.Type.TYPE_PLAYLIST || !playlist.items?.items) {
  //     throw new Error('not a valid presentation');
  //   }

  //   const presentations: CachedPresentation[] = [];
  //   for (const presentationRef of playlist.items.items) {
  //     if (!presentationRef.presentation?.documentPath) {
  //       console.log('presentation doesnt have path', presentationRef);
  //       continue;
  //     }
  //     const key = presentationRef.presentation?.documentPath?.local?.path ?? 'no-path';
  //     if (!this.presentationCache[key]) {
  //       this.presentationCache[key] = new CachedPresentation(presentationRef.presentation.documentPath, this.rootRef)
  //     }
  //   }

  //   return new Show(playlist, presentations);
  // }

  // async validatePlaylist(item: proto.rv.data.IPlaylist): Promise<string> {
  //   const presentationList = item.items?.items;
  //   if (!presentationList) {
  //     return 'not a show playlist - no items';
  //   }
  //   const problems: string[] = [];
  //   const locations: Record<string, true> = {};
  //   for (const presentationRef of presentationList) {
  //     if (!presentationRef.presentation?.documentPath?.local?.path || (presentationRef.presentation?.documentPath?.local?.root !== proto.rv.data.URL.LocalRelativePath.Root.ROOT_SHOW)) {
  //       problems.push(`${presentationRef.name} is not in the local library: ${JSON.stringify(presentationRef?.presentation?.documentPath?.local)}`);
  //       continue;
  //     }

  //     locations[presentationRef.presentation.documentPath.local.path] = true;
  //   }

  //   for (const location of Object.keys(locations)) {
  //     const presentation = await this.loadPresentation(location);
  //     console.log(location, presentation);
  //   }
  //   return problems.join(' // ');
  // }

  // private async loadPresentation(localPath: string): Promise<CachedPresentation | null> {
  //   if (!this.presentationCache[localPath]) {
  //     let presentation: proto.rv.data.IPresentation|undefined;
  //     let loadError: string = '';
  //     try {
  //       const playlistFileRef = this.rootRef.getFile(localPath);
  //       const buffer = await (await playlistFileRef).getContents();
  //       presentation = proto.rv.data.Presentation.decode(new Uint8Array(buffer));
  //     } catch (err: unknown) {
  //       loadError = err + '';
  //     }
  //     this.presentationCache[localPath] = new CachedPresentation(presentation, loadError);
  //   }

  //   return this.presentationCache[localPath] ?? null;
  // }

  async loadConfiguration(): Promise<{ error?: string, config?: Configuration }> {
    try {
      const workplace = await this.readProtoFile('Configuration/Workspace', proto.rv.data.ProPresenterWorkspace.decode);
      const config = new Configuration(this.name, workplace);
      runInAction(() => { this.config = config });
      return { config };
    } catch (err: unknown) {
      return { error: `${this.name}: ${err}` };
    }
  }

  async loadPresentation(path: string): Promise<proto.rv.data.IPresentation> {
    return await this.readProtoFile(path, proto.rv.data.Presentation.decode);
  }

  @action.bound
  async getPlaylistDoc() {
    if (!this.playList) {
      const playlist = await this.readPlaylist('Playlists/Library');
      runInAction(() => { this.playList = playlist; });
    }
    return this.playList!;
  }

  @action.bound
  async getMediaDoc(force: boolean = false) {
    if (!this.mediaPlayList || force) {
      const playlist = await this.readPlaylist('Playlists/Media');
      runInAction(() => { this.mediaPlayList = playlist; });
    }
    return this.mediaPlayList!;
  }

  @action.bound
  async reload(): Promise<void> {
    this.isLoading = true;
    const topLevelFolders = await this.rootRef.getChildren();
    const librariesRef = topLevelFolders.find(f => f.kind === 'folder' && f.name === 'Libraries') as FolderReference | undefined;
    
    if (!librariesRef) {
      throw new Error('Cant find the Libraries folder in ' + this.rootRef.name);
    }

    const [library, playlist, mediaPlaylist, mediaList] = await Promise.all([
      this.readDirectory(librariesRef),
      this.readPlaylist('Playlists/Library'),
      this.readPlaylist('Playlists/Media'),
      this.listMediaAssets(),
    ]);
    runInAction(() => {
      this.library = library;
      this.playList = playlist;
      this.indexPlaylist('shows', playlist.rootNode);
      this.mediaPlayList = mediaPlaylist;
      this.indexPlaylist('media', mediaPlaylist.rootNode);
      this.mediaAssets = mediaList;
      this.isLoading = false;
    });
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }
}