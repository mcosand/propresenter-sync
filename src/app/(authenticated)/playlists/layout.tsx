"use client";

import * as React from 'react';
import { observer } from "mobx-react-lite";
import { ProPresenterStore } from "@/services/propresenterStore";
import * as proto from '@/models/propresenter-proto';
import { PlaylistPreview } from '@/models/preview/playlistPreview';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import DownstreamGuard from '@/components/DownstreamGuard';
import { formatBytes, formatDateTime } from '@/lib/format';
import { useStore } from '@/components/StoreProvider';
import OutlineCloudIcon from '@heroicons/react/24/outline/CloudIcon';
import SolidCloudIcon from '@heroicons/react/24/solid/CloudIcon';
import SolidCloudArrowIcon from '@heroicons/react/24/solid/CloudArrowUpIcon';
import OutlineHomeIcon from '@heroicons/react/24/outline/HomeModernIcon';
import SolidHomeIcon from '@heroicons/react/24/solid/HomeModernIcon';
import FolderIcon from '@heroicons/react/24/outline/FolderIcon';
import ListIcon from '@heroicons/react/24/outline/ListBulletIcon';

const TreeView = ({ children }: React.PropsWithChildren<unknown>) => {
  return (
    <>
      {children}
    </>
  )
};

const TreeItem = ({ id, name, children }: React.PropsWithChildren<{ id: string, name: string }>) => {
  const store = useStore();

  const Icon = children ? FolderIcon : ListIcon;
  const select: () => void = children ? () => { } : () => {
    console.log('selecting item', id);
    store.selectItem(id);
  };

  return (
    <div className="pl-4 mt-2">
      <div className="flex gap-2 items-start">
        <Icon className="size-4 flex-shrink-0 mt-1" />
        <button className="btn btn-ghost text-left size-fit px-1" onClick={select}>{name}</button>
      </div>
      <div>
        {children}
      </div>
    </div>
  )
}

const PlaylistNode = ({ item, prefix }: { item: proto.rv.data.IPlaylist, prefix: string }) => {
  let children: React.JSX.Element[] | null = null;
  const itemId = `${prefix}/${item.uuid?.string ?? 'no-name'}`;

  if (item.playlists?.playlists) {
    children = item.playlists.playlists.map(p => (<PlaylistNode key={p.uuid?.string} item={p} prefix={prefix} />))
  }

  console.log('playlist node', prefix, item);
  return (
    <TreeItem id={itemId} name={item.name ?? 'no-name'}>{children}</TreeItem>
  )
};

const Playlist = ({ playlist, prefix }: { playlist: proto.rv.data.IPlaylist, prefix: string }) => {
  return (
    <TreeView>
      <PlaylistNode item={playlist} prefix={prefix} />
    </TreeView>
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
          const UpstreamIcon = !f.upstream ? SolidCloudArrowIcon : f.upstream.exists ? SolidCloudIcon : OutlineCloudIcon;
          const DownstreamIcon = !f.downstream ? null : f.downstream.exists ? SolidHomeIcon : OutlineHomeIcon
          const primary = (
            <div className="flex items-center gap-2">
              {f.name} {<UpstreamIcon className="size-4" />} {DownstreamIcon && <DownstreamIcon className="size-4" />}
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
  }, [store, id])

  if (!p) return (<div>Loading ...</div>);

  return (<PlaylistViewContent preview={p} />);
};

const PlaylistsTriplePane = observer(({ children }: React.PropsWithChildren<unknown>) => {
  const store = useStore();
  React.useEffect(() => {
    store.selectItem('');
    return () => { store.selectItem('') };
  }, [store]);

  return (
    <PanelGroup direction="vertical" style={{ flex: '1 1 auto' }}>
      <Panel minSize={10} style={{ display: 'flex' }}>
        <div className="flex flex-auto min-h-px">
          <div style={{ width: 250, borderRight: `solid 1px white`, overflowY: 'auto', padding: 8 }}>
            <div>SharePoint</div>
            {store.uptreamStore.isLoading ? <div>Loading ...</div> : (
              <>
                {store.uptreamStore.playList?.rootNode ? <Playlist playlist={store.uptreamStore.playList.rootNode} prefix={store.uptreamStore.name} /> : null}
              </>
            )}
          </div>
          <div className="flex flex-col flex-auto min-h-px p-1 overflow-y-auto">
            {children}
          </div>
          <div style={{ width: 250, borderLeft: `solid 1px white`, overflowY: 'auto', padding: 8 }}>
            <div>Local Machine</div>
            <DownstreamGuard forSetup={false} store={store} render={() => (
              store.downstreamStore?.isLoading ? <div>Loading ...</div> : (
                <>
                  {store.downstreamStore?.playList?.rootNode ? <Playlist playlist={store.downstreamStore.playList.rootNode} prefix={store.downstreamStore.name} /> : undefined}
                </>
              ))} />
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

export default PlaylistsTriplePane;