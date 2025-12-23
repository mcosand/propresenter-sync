"use client";

import { useStore } from "@/components/StoreProvider";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import * as proto from "@/models/propresenter-proto";
import { useState } from "react";

const TransferMiddlePane = observer(() => {
  const store = useStore();
  const [showingDelete, setShowingDelete] = useState(false);
  const [runningDelete, setRunningDelete] = useState(false);
  async function runDelete() {
    setRunningDelete(true);
    await store.removePlaylist(store.selectedId);
    await store.reload();
    setRunningDelete(false);
    setShowingDelete(false);
  }

  return (<div>
    {(store.downstreamStore !== null && store.selectedItem?.type === 'playlist') ? (
      <div>
        <Link href={`/playlists/transfer/${store.selectedId}`}>
          <button className="btn btn-primary">{store.selectedId.startsWith(store.uptreamStore.name) ? 'Download' : 'Upload'}</button>
        </Link>
      </div>
    ) : null}
    {store.selectedItem?.type === 'playlist' && (
      <div>
        <button className="btn btn-soft btn-error" onClick={() => setShowingDelete(true)}>Delete</button>
        {showingDelete && (
          <dialog id="transfer-dialog" className="modal" open>
            <div className="modal-box flex flex-col max-w-2xl max-h-[95vh]">
              <h3 className="font-bold text-lg">Delete Playlist {(store.selectedItem?.item as proto.rv.data.Playlist).name}</h3>
              <div className="flex flex-col min-h-px py-3">
                Are you sure you want to delete this?
              </div>
              <div className="modal-action">
                <form method="dialog" className="flex gap-2">
                  <button className="btn" onClick={() => setShowingDelete(false)}>Cancel</button>
                  <button className="btn btn-error" disabled={runningDelete} onClick={() => runDelete()}>Delete</button>
                </form>
              </div>
            </div>
          </dialog>
        )}
      </div>
    )}
  </div>);
});

export default TransferMiddlePane;