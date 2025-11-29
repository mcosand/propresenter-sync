"use client";

import * as React from 'react';
import { ProPresenterStore } from "@/services/propresenterStore";
import { ProPresenterRepository } from '@/services/propresenterRepository';
import { observer } from 'mobx-react-lite';
import ErrorIcon from '@heroicons/react/24/outline/ExclamationCircleIcon';

const NotSupported = () => (
  <div className="flex flex-col align-center">
    <div role="alert" className="alert alert-error">
      <ErrorIcon className="size-6" />
      <span>Local file access not supported. Please try a Chrome or Edge browser.</span>
    </div>
  </div>
);

const DownstreamGuard = observer(({ store, render, forSetup = false }: { forSetup: boolean, store: ProPresenterStore, render: () => React.JSX.Element | null }) => {
  const [dstore, setDStore] = React.useState<ProPresenterRepository | null>(store.downstreamStore);

  async function findFolder() {
    const dirHandle = await window.showDirectoryPicker?.();
    if (!dirHandle) {
      return undefined;
    }

    if (!forSetup) {
      try {
        const configDirHandle = await dirHandle.getDirectoryHandle("Configuration");
        const fileHandle = await configDirHandle.getFileHandle("Workspace");
        const file = await fileHandle.getFile();
        console.log(`file ${file.name} modified ${file.lastModified}`);
      } catch (err) {
        console.log('error reading directory', err);
        alert('error reading directory');
      }
    }
    await store.openDownstream(dirHandle, forSetup);
    setDStore(store.downstreamStore);
  }

  if (dstore) return render();
  if (!window.showDirectoryPicker) return (<NotSupported />)

  return (
    <div className="flex flex-col align-center">
      <div>Welcome to the ProPresenter Sync Tool. Start by opening your local ProPresenter folder (this is usually at &quot;Documents/ProPresenter&quot;)</div>
      <button className="btn btn-primary" onClick={findFolder}>Open Local Folder</button>
    </div>
  )
});

export default DownstreamGuard;