import * as React from 'react';

import { ProPresenterStore } from "@/services/propresenterStore";
import { observer } from 'mobx-react-lite';
import DownstreamGuard from '../DownstreamGuard';
import { useStore } from '../StoreProvider';
import { action, autorun, computed, makeObservable, observable, runInAction } from 'mobx';
import { PlaylistPreview } from '@/models/preview/playlistPreview';
import { formatBytes } from '@/lib/format';
import Link from 'next/link';

interface TransferFile {
  name: string;
  size: number;
  mustDownload?: boolean;
  toDownload?: boolean;
  downloading?: boolean;
  downloaded?: boolean;
}

class UiStore {
  @observable selectedFiles: Set<string> = new Set();
  @observable isDownload: boolean = true;
  @observable isLoading: boolean = true;
  @observable files: TransferFile[] = [];
  @observable title: string = '';
  @observable transferProgress: { task: string } | null = null;
  private id: string = '';
  private previewSubscription?: () => void;

  constructor(
    private readonly store: ProPresenterStore
  ) {
    makeObservable(this);
  }

  @computed
  get actionText() {
    return this.isDownload ? 'Download' : 'Upload';
  }

  @computed
  get canTransfer() {
    return !this.isLoading && this.transferProgress === null;
  }

  @computed
  get mustDownloadCount() {
    return this.files.filter(f => f.mustDownload).length;
  }

  @computed
  get downloadSize() {
    return this.files.reduce((a, c) => (a += (c.mustDownload || c.toDownload) ? c.size : 0), 0);
  }

  @action.bound
  async setId(id?: string) {
    if (id && (id !== this.id)) {
      this.id = id;
      this.isDownload = id.startsWith(this.store.uptreamStore.name);
      this.files = [];
      this.havePreview(await this.store.loadPlaylistPreview(id))
    } else if (!id) {
      this.isDownload = true;
      this.files = [];
    }
  }

  @action.bound
  havePreview(preview: PlaylistPreview) {
    this.previewSubscription?.();
    this.title = preview.name;
    this.previewSubscription = autorun(() => {
      const target = this.isDownload ? 'downstream' : 'upstream';
      const src = this.isDownload ? 'upstream' : 'downstream';
      const newFiles = preview.checkedFiles.map(f => ({
        name: f.name,
        size: f[src]?.size ?? 0,
        mustDownload: !(f[target]?.exists ?? false),
        toDownload: this.selectedFiles.has(f.name),
      }));
      runInAction(() => {
        this.files = newFiles;
        this.isLoading = false;
      })
    })
  }

  @action.bound
  toggle(file: string) {
    if (this.selectedFiles.has(file)) {
      this.selectedFiles.delete(file);
    } else {
      this.selectedFiles.add(file);
    }
  }

  @action.bound
  async doTransfer() {
    this.transferProgress = { task: 'Starting ...' };
    await this.store.transferPlaylist(
      this.id,
      this.files.filter(f => f.mustDownload || this.selectedFiles.has(f.name)).map(f => f.name),
      this.updateTransferProgress
    );
    runInAction(() => {
      this.transferProgress = { task: 'Finished' };
    });
  }

  @action.bound
  updateTransferProgress(starting: string) {
    this.transferProgress = { task: 'Transferring ' + starting };
  }
}

const GuardedTransferDialog = observer(({ store, id }: { store: ProPresenterStore, id: string }) => {
  const uiStore = React.useMemo(() => new UiStore(store), [store]);

  React.useEffect(() => {
    uiStore.setId(id).catch(err => console.error(err));
  }, [uiStore, id]);

  return (
    <dialog id="transfer-dialog" className="modal">
      <h3>Transfer Playlist {uiStore.title}</h3>
      <div className="modal-box flex flex-col min-h-px">
        {uiStore.mustDownloadCount > 0
          ? <p>This playlist includes {uiStore.mustDownloadCount} files that are not on the target machine. You can select additional files to get a refreshed copy.</p>
          : <p>You have all of the files in this playlist. You can transfer fresh copies of files by selecting them below.</p>
        }
        <div className="flex-auto overflow-y-auto">
          {uiStore.isLoading && <div><h4>Loading...</h4></div>}
          <ul className="list bg-base-100 rounded-box shadow-md">
            {uiStore.files.map(file => {
              return (<li key={file.name} className="list-row">
                <div>
                  <input type="checkbox"
                    checked={!!file.toDownload || !!file.mustDownload}
                  />
                </div>
                <div>{file.name} {formatBytes(file.size)}</div>
              </li>
              )
            })}
          </ul>
        </div>
        <div className="mt-2"><p>{uiStore.transferProgress?.task ?? `${uiStore.actionText} ${formatBytes(uiStore.downloadSize)}`}</p></div>
      </div>
      {uiStore.transferProgress?.task === 'Finished' ?
        <div className="modal-action">
          <form method="dialog">
            <Link href="/playlists">
              {/* if there is a button in form, it will close the modal */}
              <button className="btn" >Close</button>
            </Link>
          </form>
        </div>
        :
        <div className="modal-action">
          <form method="dialog">
            <Link className={`btn ${uiStore.transferProgress ? 'btn-disabled' : ''}`} href="/playlists">Cancel</Link>
            <button className="btn btn-primary" disabled={!uiStore.canTransfer} onClick={() => uiStore.doTransfer()}>{uiStore.actionText}</button>
          </form>
        </div>
      }
    </dialog>
  );
});

export const TransferDialog = observer(({ id }: { id: string }) => {
  const store = useStore();

  if (!store.downstreamStore) {
    return (
      <dialog id="guardModal" className="modal">
        <div className="modal-box">
          <DownstreamGuard forSetup={false} store={store} render={() => (<div>Loading ...</div>)} />
        </div>
      </dialog>
    );
    // <Dialog open={true}>
    //   <DialogContent>
    //     <DownstreamGuard forSetup={false} store={store} render={() => (<div>Loading ...</div>)} />
    //   </DialogContent>
    // </Dialog>
    // );
  }

  return (<GuardedTransferDialog store={store} id={id} />)
});