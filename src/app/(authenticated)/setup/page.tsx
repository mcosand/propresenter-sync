"use client"

import * as React from 'react';
import { observer } from "mobx-react-lite";
import { useStore } from "@/components/StoreProvider";
import { ProPresenterStore } from '@/services/propresenterStore';
import { action, makeObservable, observable, runInAction } from 'mobx';
import DownstreamGuard from '@/components/DownstreamGuard';
import { formatBytes } from '../../../lib/format';
import * as proto from '@/models/propresenter-proto';
import { FinderVisitor } from '../../../lib/visitor';

interface AuditResult {
  status: 'good' | 'warn' | 'error';
  text: string;
  level: number;
}

class SetupStore {
  @observable isInitializing = true;
  @observable hasBaseConfig = false;
  @observable working = false;
  @observable actionText: string = '';

  @observable auditResults: AuditResult[] = [];

  constructor(private readonly rootStore: ProPresenterStore) {
    makeObservable(this);
  }

  @action.bound
  async init() {
    const filesStatus = await this.rootStore.downstreamStore?.getFilesStatus(['Configuration/Workspace']);
    runInAction(() => {
      console.log('init result', filesStatus);
      if (filesStatus?.[0].exists) {
        this.hasBaseConfig = true;
      }
      this.isInitializing = false;
    });
  }

  @action.bound
  async downloadConfig() {
    this.working = true;
    await this.rootStore.downloadFullConfig(file => {
      runInAction(() => {
        this.actionText = `${file.path} (${formatBytes(file.size)})`;
      });
    });
    runInAction(() => {
      this.actionText = 'Finished';
      this.working = false;
      this.hasBaseConfig = true;
    });
  }

  async auditConfig() {
    const results: AuditResult[] = [];
    try {
      const templateWorkspace = await this.rootStore.uptreamStore?.readProtoFile('Configuration/Workspace', proto.rv.data.ProPresenterWorkspace.decode);
      const workspace = await this.rootStore.downstreamStore?.readProtoFile('Configuration/Workspace', proto.rv.data.ProPresenterWorkspace.decode);

      for (const templateScreen of templateWorkspace.proScreens) {
        const match = FinderVisitor.findById<proto.rv.data.ProPresenterScreen>(templateScreen.uuid?.string ?? '', workspace);
        if (!match) {
          results.push({
            text: `Missing or mismatched Screen "${templateScreen.name ?? 'Unnamed'}" (${templateScreen.uuid?.string ?? ''})`,
            status: templateScreen.screenType === proto.rv.data.ProPresenterScreen.ScreenType.SCREEN_TYPE_AUDIENCE ? 'error' : 'warn',
            level: 0,
          });
        } else {
          results.push({
            text: `Screen present: ${templateScreen.name ?? 'Unnamed'}`,
            status: 'good',
            level: 0,
          })
          const templateSize = templateScreen.arrangementSingle?.screens?.[0].bounds?.size;
          const matchSize = match.arrangementSingle?.screens?.[0].bounds?.size;

          if (templateSize?.height === matchSize?.height && templateSize?.width === matchSize?.width) {
            results.push({
              text: `Screen size: ${templateSize?.width}x${templateSize?.height}`,
              status: 'good',
              level: 1,
            });
          } else {
            results.push({
              text: `Screen size (${matchSize?.width}x${matchSize?.height}) should be ${templateSize?.width}x${templateSize?.height}`,
              status: 'error',
              level: 1,
            });
          }
        }
      }

      let myLooks = workspace?.audienceLooks ?? [];
      for (const templateLook of templateWorkspace.audienceLooks) {
        const match = FinderVisitor.findById<proto.rv.data.ProAudienceLook>(templateLook.uuid?.string ?? '', workspace);
        if (!match) {
          results.push({
            text: `Missing or mismatched Look "${templateLook.name}" (${templateLook.uuid?.string ?? ''})`,
            status: 'error',
            level: 0,
          })
        } else {
          results.push({
            text: `Look present: "${templateLook.name ?? 'Unnamed'}"`,
            status: 'good',
            level: 0,
          });
          myLooks = myLooks.filter(f => f !== match);
        }
      }
      for (const look of myLooks) {
        results.push({
          text: `Extra Audience Look: "${look.name}" (${look.uuid?.string ?? ''})`,
          status: 'warn',
          level: 0,
        });
      }

      console.log('audit against', templateWorkspace, workspace);
    } catch (err) {
      alert(err);
    }
    runInAction(() => { this.auditResults = results });
  }
}

const GuardedSetupScreen = observer((): React.JSX.Element => {
  const rootStore = useStore();
  const store = React.useMemo(() => new SetupStore(rootStore), [rootStore]);
  React.useEffect(() => {
    store.init().catch(err => alert(err));
  }, [store]);

  if (store.isInitializing) {
    return (<div className="flex flex-col flex-auto justify-center items-center">
      <div role="alert" className="alert">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-info h-6 w-6 shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <span>Initializing...</span>
      </div>
    </div>);
  } else if (!store.hasBaseConfig) {
    return (
      <div className="flex flex-col flex-auto justify-center items-center">
        <p>{store.actionText ?? 'For best results, close ProPresenter before downloading.'}</p>
        {/*loading={store.working} loadingPosition="end"*/}
        <button className="btn btn-primary" onClick={store.downloadConfig}>Download</button>
      </div>
    );
  }

  let lastLevel = 10;
  return (
    <div className="flex flex-col flex-auto">
      <button className="btn my-2 self-center" onClick={() => runInAction(() => { store.hasBaseConfig = false; })}>Download Clean Config</button>
      <button className="btn self-center" onClick={() => store.auditConfig()}>Audit</button>
      {store.auditResults.map((r, i) => {
        const mt = r.level === 0 && lastLevel > 0 ? 1 : undefined;
        lastLevel = r.level;
        return (
          <div key={i} className={`mt-${mt ?? 1} pl-${r.level * 2}`}>{r.status}: {r.text}</div>
        )
      }
      )}
    </div>
  )
});

const SetupScreen = (): React.JSX.Element => (<DownstreamGuard forSetup={true} store={useStore()} render={() => <GuardedSetupScreen />} />);
export default SetupScreen;