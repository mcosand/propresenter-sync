"use client";

import { useStore } from "@/components/StoreProvider";
import { observer } from "mobx-react-lite";
import Link from "next/link";

const TransferMiddlePane = observer(() => {
  const store = useStore();
  return (<>
    {(store.downstreamStore !== null && store.selectedItem?.type === 'playlist') ? (
      <Link href={`/playlists/transfer/${store.selectedId}`}>
        <button className="btn btn-primary">{store.selectedId.startsWith(store.uptreamStore.name) ? 'Download' : 'Upload'}</button>
      </Link>
      
    ) : null}
  </>);
});

export default TransferMiddlePane;