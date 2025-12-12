"use client";

import * as React from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "@/components/StoreProvider";
import { ProPresenterStore } from "@/services/propresenterStore";
import { LibraryFolder, LibraryItem } from "@/services/propresenterRepository";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PresentationPreview, SlideGroupPreview } from "@/models/preview/presentationPreview";
import { NULL_ARRANGEMENT_ID } from "@/models/preview";

const SlideGroupView = ({ group }: { group: SlideGroupPreview }) => {
  console.log('group', group.color, group);
  return (
    <div style={{ position: 'relative', borderLeft: '22px solid ' + group.color, paddingLeft: 5, minHeight: 100 }}>
      <div style={{ padding: '2px 6px', fontWeight: 'bold', backgroundColor: group.color, position: 'absolute', top: 0, left: 0, transformOrigin: '0 0', transform: 'rotate(90deg)' }}>
        {group.name}
      </div>
      <div>
        {group.slides.map((slide, i) => {
          const isSameNotes = (i > 0 && group.slides[i - 1].notes === slide.notes && slide.notes.length > 0);
          return (
            <div key={slide.uuid} className="flex flex-row">
              <div style={{ margin: 5, padding: 5, border: `solid 1px white`, whiteSpace: 'pre', position: 'relative', minWidth: 100, minHeight: 60 }}>
                <div style={{ color: isSameNotes ? 'transparent' : undefined }}>{slide.notes}</div>
                {isSameNotes && <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, fontSize: 48, fontWeight: 'bold', textAlign: 'center', paddingTop: 20 }}>&quot;</div>}
              </div>
              <div key={slide.uuid} style={{ margin: 5, padding: 5, border: `solid 1px white`, whiteSpace: 'pre', minWidth: 100, minHeight: 60 }}>
                {slide.text.join('\n')}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const PresentationPreviewView = ({ store, id }: { store: ProPresenterStore, id: string }): React.JSX.Element => {
  const [p, setP] = React.useState<PresentationPreview>();
  const [arrangement, setArrangement] = React.useState<string>(NULL_ARRANGEMENT_ID);
  React.useEffect(() => {
    setArrangement(NULL_ARRANGEMENT_ID);
    store.loadPresentationPreview(id).then(setP).catch(console.error);
    return () => setP(undefined);
  }, [store, id])

  console.log('render preview', id, p);
  console.log('selected arrangement', arrangement, p?.arrangements[arrangement])
  return p ? (
    <>
      <div className="flex flex-row items-center">
        Arrangement:
        <select defaultValue={p.arrangements[0]} className="select mx-2" onChange={evt => setArrangement(evt.target.value)}>
          {Object.keys(p.arrangements).map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      <div style={{ flex: '1 1 auto', overflowY: 'auto', overflowX: 'auto' }}>
        {p.arrangements[arrangement].map((cueGroupId, i) => {
          console.log('check', cueGroupId, p.slideGroups);
          const grp = p.slideGroups[cueGroupId];
          return (<SlideGroupView key={cueGroupId + '-' + i} group={grp} />)
        })}
      </div>
    </>
  ) : <div>Loading ...</div>;
};

const TreeNode = observer(({ item, path, depth }: { item: LibraryItem | LibraryFolder, path: string, depth: number }): React.JSX.Element => {
  const parts = item.path.split('/').slice(2);
  const urlPath = parts.map(encodeURIComponent).join('/');
  const relativePath = parts.join('/');
  const expanded = path?.startsWith(relativePath);

  if (item.type === 'item') {
    return (
      <div style={{ paddingLeft: depth * 24 }}>
        <Link className="whitespace-nowrap" href={`/library/${urlPath}`}>{item.name.replace('.pro', '')}</Link>
      </div>
    );
  }

  return (
    <div style={{ paddingLeft: depth * 24 }}>
      <Link className="whitespace-nowrap" href={`/library/${urlPath}`}>{item.name}</Link>
      {expanded && <div>{item.children.map(child => (<TreeNode key={child.name} item={child} path={path} depth={depth + 1} />))}</div>}
    </div>
  )
});

const LibraryScreen = observer(() => {
  const { slug } = useParams();
  const path = decodeURIComponent((slug as string[] ?? []).join('/'));
  const store = useStore();

  React.useEffect(() => {
    store.selectItem(`${store.uptreamStore.name}/${path}`);
  }, [store, path]);

  return (
    <div className="flex flex-auto min-h-px">
      <div className="min-h-px overflow-y-auto py-4 shrink-0" style={{ width: 200, borderRight: `solid 1px white` }}>
        {store.uptreamStore.isLoading ? <div>Loading ...</div> : (
          <>
            <div>SharePoint</div>
            {store.uptreamStore.library?.children.map(child => (<TreeNode key={child.name} item={child} path={path} depth={0} />))}
          </>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
        {store.selectedItem?.type === 'presentation' && <PresentationPreviewView store={store} id={store.selectedId!} />}
      </div>
    </div>
  )
});

export default LibraryScreen;