"use client";

import * as React from 'react';
import { observer } from "mobx-react-lite";
import { ProPresenterStore } from "@/services/propresenterStore";
import * as proto from '@/models/propresenter-proto';
import { PlaylistPreview } from '@/models/preview/playlistPreview';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import DownstreamGuard from '@/components/DownstreamGuard';
import { formatBytes, formatDateTime } from '@/lib/format';
import { TransferDialog } from '@/components/playlists/TransferDialog';
import { useStore } from '@/components/StoreProvider';
import Link from 'next/link';
import OutlineCloudIcon from '@heroicons/react/24/outline/CloudIcon';
import SolidCloudIcon from '@heroicons/react/24/solid/CloudIcon';
import SolidCloudArrowIcon from '@heroicons/react/24/solid/CloudArrowUpIcon';
import OutlineHomeIcon from '@heroicons/react/24/outline/HomeModernIcon';
import SolidHomeIcon from '@heroicons/react/24/solid/HomeModernIcon';

const PlaylistNode = ({ item, prefix, }: { item: proto.rv.data.IPlaylist, prefix: string }) => {
  let children: React.JSX.Element[] | null = null;
  const itemId = `${prefix}/${item.uuid?.string ?? 'no-name'}`;

  if (item.playlists?.playlists) {
    children = item.playlists.playlists.map(p => (<PlaylistNode key={p.uuid?.string} item={p} prefix={prefix} />))
  }

  return (
    // <TreeItem itemId={itemId} label={item.name ?? 'no-name'} style={{ color: 'navy' }}>{children}</TreeItem>
    <div>PlaylistNode</div>
  )
};

const Playlist = ({ playlist, prefix, selected, doSelect }: { playlist: proto.rv.data.IPlaylist, prefix: string, selected: string | undefined, doSelect: (id: string) => void }) => {
  return (
    <div>TreeView</div>
    // <SimpleTreeView selectedItems={selected} onSelectedItemsChange={(_, items) => {
    //   doSelect(items ?? '')
    // }}>
    //   <PlaylistNode item={playlist} prefix={prefix} />
    // </SimpleTreeView>
  );
};

const PlaylistViewContent = observer(({ preview }: { preview: PlaylistPreview }) => {
  return (
    <div className="flex flex-col flex-auto min-h-px overflow-y-auto">
      Validating Playlist {preview?.name}
      <div>Valid: {preview.isValid ? 'yes' : 'no'}</div>
      <div>Required Files</div>
      <ul className="list bg-base-100 rounded-box shadow-md">
        {preview.checkedFiles.map(f => {
          const upstreamIcon = !f.upstream ? <SolidCloudArrowIcon /> : f.upstream.exists ? <SolidCloudIcon /> : <OutlineCloudIcon />;
          const downstreamIcon = !f.downstream ? null : f.downstream.exists ? <SolidHomeIcon /> : <OutlineHomeIcon />;
          const primary = (
            <div className="flex">
              {f.name} {upstreamIcon} {downstreamIcon}
            </div>
          )
          let secondary: string = '';
          if (f.upstream?.exists) {
            secondary += `Server: ${formatBytes(f.upstream.size)}, ${formatDateTime(f.upstream.modified)} `;
          }
          if (f.downstream?.exists) {
            secondary += `Disk: ${formatBytes(f.downstream?.size)}, ${formatDateTime(f.downstream.modified)} `;
          }
          return (
            <li key={f.name} className="list-row">
              <div>
                <div>{primary}</div>
                <div className="text-xs uppercase font-semibold opacity-60">{secondary}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  )
});

const PlaylistView = ({ store, id }: { store: ProPresenterStore, id: string }) => {
  const [p, setP] = React.useState<PlaylistPreview>();

  React.useEffect(() => {
    store.loadPlaylistPreview(id).then(setP).catch(e => { throw e });
    return () => setP(undefined);
  }, [id])

  if (!p) return (<div>Loading ...</div>);

  return (<PlaylistViewContent preview={p} />);
};

export const PlaylistsTriplePane = observer(() => {
  const store = useStore();
  React.useEffect(() => {
    store.selectItem('');
    return () => { store.selectItem('') };
  }, [store]);

  return (
    <PanelGroup direction="vertical" style={{ flex: '1 1 auto' }}>
      <Panel minSize={10} style={{ display: 'flex' }}>
        <div className="flex flex-auto min-h-px">
          <div style={{ width: 200, borderRight: `solid 1px white`, overflowY: 'auto', padding: 8 }}>
            <div>SharePoint</div>
            {store.uptreamStore.isLoading ? <div>Loading ...</div> : (
              <>
                {store.uptreamStore.playList?.rootNode ? <Playlist playlist={store.uptreamStore.playList.rootNode} prefix={store.uptreamStore.name} selected={store.selectedId} doSelect={store.selectItem} /> : null}
              </>
            )}
          </div>
          <div className="flex flex-col flex-auto min-h-px p-1">
            <div>Middle</div>
          </div>
          <div style={{ width: 200, borderLeft: `solid 1px white`, overflowY: 'auto', padding: 8 }}>
            <div>Local Machine</div>
            <DownstreamGuard forSetup={false} store={store} render={() => (
              store.downstreamStore?.isLoading ? <div>Loading ...</div> : (
                <>
                  {store.downstreamStore?.playList?.rootNode ? <Playlist playlist={store.downstreamStore.playList.rootNode} prefix={store.downstreamStore.name} selected={store.selectedId} doSelect={store.selectItem} /> : undefined}
                </>
              ))
            } />
          </div>
        </div>
      </Panel>
      <PanelResizeHandle />
      <Panel minSize={10} style={{ display: 'flex' }}>
        <div className="flex flex-col flex-auto min-h-px" style={{ borderTop: `solid 1px white` }}>
          {store.selectedItem?.type === 'playlist' && <PlaylistView store={store} id={store.selectedId!} />}
        </div>
      </Panel>
    </PanelGroup>
  )
});

export default function PlaylistsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <PlaylistsTriplePane/>
}

// export const PlaylistsScreen = () => {
//   return (
//     <>
//       <Routes>
//         <Route Component={PlaylistsTriplePane}>
//           <Route index Component={TransferMiddlePane} />
//           <Route path="transfer/*" Component={TransferDialog} />
//         </Route>
//       </Routes>
//     </>
//   );
// }