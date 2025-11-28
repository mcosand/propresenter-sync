import { computed, makeObservable, observable, runInAction } from 'mobx';
import { PlaceholderPreview } from ".";
import * as proto from '@/models/propresenter-proto';
import type { ProPresenterRepository } from "@/services/propresenterRepository";
import { PresentationPreview } from "./presentationPreview";


export class FileStorageStatus {
  readonly name: string;

  upstream: {
    exists: boolean;
    size: number;
    modified: number;
  }|null = null;

  downstream: {
    exists: boolean;
    size: number;
    modified: number;
  }|null = null;

  private constructor(name: string) {
    this.name = name;

    makeObservable(this, {
      upstream: observable,
      downstream: observable,
    });
  }

  static init(name: string, target: 'upstream'|'downstream', status: { exists: boolean, size: number, modified: number }) {
    const newStatus = new FileStorageStatus(name);
    runInAction(() => {
      newStatus[target] = status;
    });
    return newStatus;
  }

  cloneAndUpdate(target: 'upstream'|'downstream', status: { exists: boolean, size: number, modified: number }|null) {
    const newStatus = new FileStorageStatus(this.name + '');
    runInAction(() => {
      newStatus.upstream = JSON.parse(JSON.stringify(this.upstream));
      newStatus.downstream = JSON.parse(JSON.stringify(this.downstream));
      newStatus[target] = status;
    });
    return newStatus;
  }
}

export class PlaylistPreview {
  @observable
  readonly presentations: Array<PresentationPreview | PlaceholderPreview> = [];
  @observable
  checkedFiles: FileStorageStatus[] = [];
  isFound: boolean = true;

  constructor(readonly uuid: string, readonly name: string) {
    makeObservable(this);
  }

  get isValid() {
    return this.isFound && !this.presentations.some(f => !f.isValid);
  }

  @computed
  get resolvedFiles(): { files: string[], unresolved: Array<proto.rv.data.IURL>} {
    const results = this.presentations.flatMap(f => f.resolveFiles());
    return {
      files: results.flatMap(r => r.files),
      unresolved: results.flatMap(r => r.unresolved),
    };
  }

  async loadFromRepository(playlist: proto.rv.data.IPlaylist, repo: ProPresenterRepository, isUpstream: boolean): Promise<PlaylistPreview> {
    const presentations = await Promise.all(playlist.items?.items?.map(item => this.loadPlaylistItem(item, repo)) ?? []);
    runInAction(() => this.presentations.push(...presentations));

    const srcRepo = isUpstream ? 'upstream' : 'downstream';
    const fileStatus = await repo.getFilesStatus(runInAction(() => this.resolvedFiles.files));
    const result = fileStatus.map(status => {
      const { name, ...parts } = status;
      return FileStorageStatus.init(name, srcRepo, parts);
    });
    for (const url of runInAction(() => this.resolvedFiles.unresolved)) {
      const name = url.absoluteString ?? url.relativePath ?? url.local?.path ?? url.external?.path ?? JSON.stringify(url);
      result.push(FileStorageStatus.init(name, srcRepo, {
          exists: false,
          size: 0,
          modified: 0,
        }
      ));
    }
    runInAction(() => {
      this.checkedFiles = result.sort((a,b) => a.name.localeCompare(b.name));
    });
    return this;
  }

  private async loadPlaylistItem(ref: proto.rv.data.IPlaylistItem, repo: ProPresenterRepository): Promise<PresentationPreview | PlaceholderPreview> {
    if (ref.placeholder) {
      return new PlaceholderPreview(ref.uuid?.string ?? '', ref.name ?? '');
    } else if (ref.presentation) {
      const preview = new PresentationPreview(ref.uuid?.string ?? '', ref.name ?? '', ref.presentation.documentPath);
      const result = await preview.loadFromRepository(repo);
      return result;
    } else {
      throw new Error('unknown playlist item type');
    }
  }
}
