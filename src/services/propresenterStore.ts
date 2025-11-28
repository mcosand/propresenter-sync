import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { getSharePointRoot } from "./platforms/sharepoint";
import { LocalFolderReference } from "./platforms/localFile";
import { ProPresenterRepository } from "./propresenterRepository";
import * as proto from '@/models/propresenter-proto';
import deepEqual from 'deep-equal';
import { PresentationPreview } from "@/models/preview/presentationPreview";
import { FileStorageStatus, PlaylistPreview } from '@/models/preview/playlistPreview';
import { joinPath } from "./platforms";
import { MediaFinder, FinderVisitor, RemoveAbsoluteUrls, UrlResolver } from "@/lib/visitor";

export type ObjectType = 'playlistFolder' | 'playlist' | 'mediaInfo' | 'mediaContent' | 'library' | 'presentation';

export interface ItemWrapper<T> {
  type: ObjectType;
  store: string;
  item: T;
}

export interface ConfigurationTask {
  key: string;
  label: string;
  dependsOn: string[];
  action: () => Promise<void>;
}

export class ProPresenterStore {
  @observable name: string = '';
  @observable selectedId: string = '';

  uptreamStore: ProPresenterRepository;
  @observable downstreamStore: ProPresenterRepository | null = null;
  private stores: Record<string, ProPresenterRepository> = {};

  constructor() {
    makeObservable(this);
    this.uptreamStore = new ProPresenterRepository("SharePoint", getSharePointRoot());
    this.stores.SharePoint = this.uptreamStore;
  }

  async reload(): Promise<void> {
    await Promise.all([
      this.downstreamStore?.reload(),
      this.uptreamStore.reload()
    ]);
  }

  async loadConfigurations(): Promise<string[]> {
    const results = await Promise.all([
      this.downstreamStore?.loadConfiguration(),
      this.uptreamStore.loadConfiguration(),
    ]);
    return results.filter(f => !!f?.error).flatMap(result => result!.error!);
  }

  private toRepoPath(path: string): { repoPath: string, repo: ProPresenterRepository | null } {
    const idx = path.indexOf('/');
    const repo = path.substring(0, idx) === this.uptreamStore.name ? this.uptreamStore : this.downstreamStore;
    return {
      repo,
      repoPath: path.substring(idx + 1),
    }
  }

  @computed
  get selectedItem(): ItemWrapper<unknown> | undefined {
    console.log('computing selectedItem', this.selectedId);
    if (this.selectedId) {
      if (this.selectedId.includes('/')) {
        const { repo, repoPath } = this.toRepoPath(this.selectedId);
        console.log('fetching repo path', repo, repoPath);
        return repo?.getItemById(repoPath);
      }
    }
  }

  @action.bound
  selectItem(item: string): void {
    this.selectedId = item;
  }

  private async downloadFiles(fromRepo: ProPresenterRepository, toRepo: ProPresenterRepository, files: string[], opts?: {
    progress?: (file: { path: string, size: number }) => void,
  }): Promise<void> {
    let fromMediaDoc: proto.rv.data.PlaylistDocument | undefined;
    let toMediaDoc: proto.rv.data.PlaylistDocument | undefined;

    for (const file of files) {
      opts?.progress?.({ path: file, size: 0 });
      if (file.startsWith('Library/')) {
        const presentation = await fromRepo.loadPresentation(file);
        RemoveAbsoluteUrls.clean(presentation);
        await toRepo.writeProtoFile(file, presentation, proto.rv.data.Presentation.encode);
      } else if (file.startsWith('Themes/') && file.endsWith('/Theme')) {
        const themeDoc = await fromRepo.readProtoFile(file, proto.rv.data.Template.Document.decode);
        RemoveAbsoluteUrls.clean(themeDoc);
        await toRepo.writeProtoFile(file, themeDoc, proto.rv.data.Template.Document.encode);
      } else if (file === 'Configuration/Workspace') {
        const workspaceDoc = await fromRepo.readProtoFile(file, proto.rv.data.ProPresenterWorkspace.decode);
        if (workspaceDoc) {
          workspaceDoc.recordSettings = null;
          await toRepo.writeProtoFile(file, workspaceDoc, proto.rv.data.ProPresenterWorkspace.encode);
        }
      } else {
        const srcStream = await fromRepo.getFileStream(file);
        await toRepo.uploadFile(file, srcStream, bytes => opts?.progress?.({ path: file, size: bytes }));
        if (file.startsWith('Media/')) {
          if (!fromMediaDoc || !toMediaDoc) {
            [fromMediaDoc, toMediaDoc] = await Promise.all([fromRepo.getMediaDoc(), toRepo.getMediaDoc()]);
            if (!fromMediaDoc || !toMediaDoc) {
              throw new Error('cant find media playlists');
            }
          }
          const existingTargetMediaRef = MediaFinder.find(file, fromMediaDoc);
          if (!existingTargetMediaRef) {
            const srcMediaRef = MediaFinder.find(file, toMediaDoc);
            if (srcMediaRef) {
              RemoveAbsoluteUrls.clean(srcMediaRef);
              await toRepo.insertMediaReference(srcMediaRef);
            }
          }
        }
      }
    }
  }

  private async downloadFolder(relativePath: string, opts?: {
    progress?: (file: { path: string, size: number }) => void,
    filter?: (path: string) => boolean
  }): Promise<void> {
    let list = (await this.uptreamStore.listFiles(relativePath, true)).map(f => f.name);
    if (opts?.filter) {
      list = list.filter(opts.filter);
    }
    await this.downloadFiles(this.uptreamStore, this.downstreamStore!, list, opts);
  }

  @action.bound
  async openDownstream(downstreamRoot: FileSystemDirectoryHandle, skipReload = false): Promise<void> {
    const oldStore = this.downstreamStore;
    runInAction(() => {
      this.downstreamStore = new ProPresenterRepository("Disk", new LocalFolderReference(downstreamRoot, ""));
      this.stores.Disk = this.downstreamStore;
    });
    if (oldStore) {
      oldStore.dispose().catch(console.error);
    }
    if (skipReload) {
      return;
    }
    await this.downstreamStore?.reload();
  }

  @action.bound
  async downloadFullConfig(progress?: (file: { path: string, size: number }) => void): Promise<void> {
    await this.downloadFolder("Configuration", { progress/*, filter: path => (path !== 'Configuration/Workspace' && path !== 'Configuration/Capture')*/ });
    await this.downloadFolder("Themes", { progress });
  }

  @computed
  private get configureMeTasks(): ConfigurationTask[] {
    if (!this.downstreamStore?.config || !this.uptreamStore.config) {
      return [];
    }

    const createRemoveTask = (uuid: string, name: string): ConfigurationTask => {
      const removeTask: ConfigurationTask = {
        key: 'remove-screen-' + uuid,
        label: `Remove screen "${name}"`,
        dependsOn: [],
        action: () => Promise.resolve(this.downstreamStore!.config!.removeScreen(uuid)),
      }
      return removeTask;
    }

    const tasks: ConfigurationTask[] = [];
    const extraDownScreenIds = this.downstreamStore.config.screens.reduce((accum, cur) => { accum[cur.uuid] = cur.name; return accum; }, {} as Record<string, string>);
    for (const upScreen of this.uptreamStore.config.screens) {
      const downScreen = this.downstreamStore.config.screens.find(f => f.uuid === upScreen.uuid);
      if (!downScreen) {
        const createTask: ConfigurationTask = {
          key: 'create-screen-' + upScreen.uuid,
          label: `Create Screen "${upScreen.name}"`,
          dependsOn: [],
          action: () => Promise.resolve(this.downstreamStore?.config!.createPlaceholderScreen(upScreen)),
        };

        const sameNameScreen = this.downstreamStore.config.screens.find(f => f.name === upScreen.name);
        if (sameNameScreen) {
          const removeTask = createRemoveTask(sameNameScreen.uuid, sameNameScreen.name);
          createTask.dependsOn.push(removeTask.key);
          tasks.push(removeTask);
          delete extraDownScreenIds[sameNameScreen.uuid];
        }
        tasks.push(createTask);
      }
    }
    for (const [uuid, name] of Object.entries(extraDownScreenIds)) {
      tasks.push(createRemoveTask(uuid, name));
    }

    for (const upLook of this.uptreamStore.config.looks) {
      const downLook = this.downstreamStore.config.looks.find(f => f.uuid === upLook.uuid);
      if (!downLook) {
        const createTask: ConfigurationTask = {
          key: 'create-look-' + upLook.uuid,
          label: `Create Look "${upLook.name}"`,
          dependsOn: [],
          action: () => Promise.resolve(),
        }

        const sameNameLook = this.downstreamStore.config.looks.find(f => f.name === upLook.name);
        if (sameNameLook) {
          const renameTask = {
            key: 'rename-look-' + sameNameLook.uuid,
            label: `Rename look "${sameNameLook.name}"`,
            dependsOn: [],
            action: () => Promise.reject(),
          }
          createTask.dependsOn.push(renameTask.key);
          tasks.push(renameTask);
        }
        tasks.push(createTask);
      } else if (!deepEqual(downLook, upLook)) {
        tasks.push({
          key: 'update-look-' + upLook.uuid,
          label: `Update look "${upLook.name}"`,
          dependsOn: [],
          action: () => Promise.reject(),
        })
      }
    }

    return tasks;
  }

  async applyConfigureMeTasks(): Promise<string> {
    try {
      const tasks = [...this.configureMeTasks];
      for (const task of tasks) {
        await task.action();
      }
      await this.downstreamStore?.commitConfig();
      return '';
    } catch (err: unknown) {
      return err + '';
    }
  }

  async loadPresentation(path: string): Promise<{ doc: proto.rv.data.IPresentation }> {
    const { repo, repoPath } = this.toRepoPath(path);
    const presentation = await repo!.loadPresentation(joinPath('Libraries', repoPath));

    return {
      doc: presentation
    }
  }

  async getProtoFile<T>(repoAndPath: string, decoder: (bytes: Uint8Array) => T): Promise<T> {
    const { repo, repoPath } = this.toRepoPath(repoAndPath);
    const doc = await repo!.readProtoFile(repoPath, decoder);
    return doc;
  }

  async loadPresentationPreview(path: string): Promise<PresentationPreview> {
    const { repo, repoPath } = this.toRepoPath(path);
    const presentation = await this.loadPresentation(path);

    const preview = new PresentationPreview(presentation.doc.uuid?.string ?? '', presentation.doc.name ?? '', { local: { path: joinPath('Libraries', repoPath), root: proto.rv.data.URL.LocalRelativePath.Root.ROOT_SHOW } });
    return await preview.loadFromRepository(repo!);
  }

  async loadPlaylistPreview(id: string): Promise<PlaylistPreview> {
    const { repo, repoPath } = this.toRepoPath(id);
    const otherRepo = repo === this.uptreamStore ? this.downstreamStore : this.uptreamStore;
    const playlistRoot = (repo!.getItemById(repoPath)?.item as proto.rv.data.IPlaylist);
    if (!playlistRoot) {
      throw new Error('Cant find playlist ' + id);
    }

    const preview = new PlaylistPreview(playlistRoot.uuid?.string ?? '', playlistRoot.name ?? '');
    const result = await preview.loadFromRepository(playlistRoot, repo!, repo === this.uptreamStore);
    if (otherRepo) {
      runInAction(() => {
        this.checkOtherRepository(result.checkedFiles, otherRepo, otherRepo === this.uptreamStore)
          .then(updated => runInAction(() => {
            result.checkedFiles = updated;
          }))
          .catch(err => { throw err });
      })
    }
    return result;
  }

  private async checkOtherRepository(files: FileStorageStatus[], otherRepo: ProPresenterRepository, isUpstream: boolean): Promise<FileStorageStatus[]> {
    const updatedChecked: FileStorageStatus[] = [];
    const fileNames = files.map(f => f.name);

    const otherStatus = await otherRepo.getFilesStatus(fileNames);
    runInAction(() => {
      for (const file of files) {
        const match = otherStatus.find(f => f.name === file.name);
        updatedChecked.push(file.cloneAndUpdate(isUpstream ? 'upstream' : 'downstream', match ?? null));
      }
    });
    return updatedChecked;
  }

  async transferPlaylist(id: string, includeFiles: string[], progress: (name: string) => void): Promise<void> {
    const { repo: srcRepo, repoPath: uuid } = this.toRepoPath(id);
    const targetRepo = id.startsWith(this.uptreamStore.name) ? this.downstreamStore! : this.uptreamStore;
    if (!srcRepo || !targetRepo) {
      throw new Error('invalid repository state');
    }

    await this.downloadFiles(srcRepo, targetRepo, includeFiles, {
      progress: (fileAndSize) => progress(fileAndSize.path)
    });

    const srcMediaDoc = await srcRepo.getMediaDoc();
    const ur = new UrlResolver();
    ur.walk(srcMediaDoc);

    progress('copying playlist');
    const [srcPlaylistDoc, targetPlaylistDoc] = await Promise.all([srcRepo.getPlaylistDoc(), targetRepo.getPlaylistDoc()]);

    const playlist = FinderVisitor.findById<proto.rv.data.Playlist>(uuid, srcPlaylistDoc);
    if (!playlist) {
      throw new Error('Cant find playlist ' + uuid + ' in source repository');
    }

    const targetList = targetPlaylistDoc.rootNode?.playlists?.playlists;
    if (!targetList) {
      throw new Error('target library doesnt have a root list');
    }

    await targetRepo.insertPlaylist('shows', playlist);
  }
}