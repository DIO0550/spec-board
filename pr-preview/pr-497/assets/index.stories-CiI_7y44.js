import{a as e,n as t}from"./chunk-BneVvdWh.js";import{t as n}from"./iframe-CcRx3JDX.js";import{t as r}from"./jsx-runtime-B6lWK8m9.js";import{n as i,t as a}from"./task-projection-BM6-xIJc.js";import{r as o,t as s}from"./task-path-D3zMuKvm.js";import{i as c,n as l}from"./test-fixtures-BHn6QY-n.js";import{r as u,t as d}from"./broken-link-Bp5okOD2.js";import{n as f,t as p}from"./BrokenRefLabel-DIzlNbw-.js";var m,h,g,_,v=t((()=>{m=e(n(),1),f(),u(),s(),i(),h=r(),g=(e,t,n)=>{let r=d(t),i=[],a=0;for(let t of e){let e=o(t),s=e===void 0?void 0:r.get(e);if(s!==void 0){i.push({kind:`resolved`,task:s});continue}n?.has(t)&&(i.push({kind:`broken`,rawPath:t,brokenIndex:a}),a+=1)}return i},_=({parentTask:e,childTasks:t,subIssueCounts:n,isDone:r,onAddSubIssue:i,onChildClick:o,brokenChildPaths:s})=>{let{done:c,total:l}=n,u=a.percentage(n),d=(0,m.useMemo)(()=>g(e.hierarchy.childFilePaths,t,s),[e.hierarchy.childFilePaths,t,s]),f=l>0,_=d.length>0;return(0,h.jsxs)(`div`,{"data-testid":`sub-issue-section`,children:[(0,h.jsx)(`div`,{className:`mb-2 flex items-center justify-between`,children:(0,h.jsxs)(`span`,{className:`text-xs font-medium text-muted`,children:[`サブIssue `,f?`(${c}/${l})`:``]})}),f&&(0,h.jsxs)(`div`,{className:`mb-2 flex items-center gap-2`,children:[(0,h.jsx)(`div`,{className:`h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted`,role:`progressbar`,"aria-valuenow":u,"aria-valuemin":0,"aria-valuemax":100,"aria-label":`進捗 ${c}/${l}`,children:(0,h.jsx)(`div`,{className:`h-full rounded-full bg-green-500 transition-all`,style:{width:`${u}%`}})}),(0,h.jsxs)(`span`,{className:`text-xs text-muted`,children:[c,`/`,l]})]}),_&&(0,h.jsx)(`ul`,{className:`mb-2 space-y-1 text-sm text-foreground`,children:d.map(e=>{if(e.kind===`broken`)return(0,h.jsx)(`li`,{"data-testid":`sub-issue-broken-${e.brokenIndex}`,"data-path":e.rawPath,"data-broken":`true`,className:`flex items-center gap-2 px-1.5 py-1`,children:(0,h.jsx)(p,{rawPath:e.rawPath})},`broken-${e.brokenIndex}-${e.rawPath}`);let t=e.task,n=r(t.filePath),i=t.title||t.filePath;return(0,h.jsx)(`li`,{children:(0,h.jsxs)(`button`,{type:`button`,className:`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-surface-muted disabled:cursor-default disabled:hover:bg-transparent`,disabled:o===void 0,onClick:()=>o?.(t.id),"data-testid":`sub-issue-item-${t.id}`,children:[(0,h.jsx)(`span`,{"aria-hidden":`true`,className:n?`text-green-600`:`text-muted`,children:n?`✓`:`○`}),(0,h.jsx)(`span`,{className:`min-w-0 flex-1 truncate`,children:i}),(0,h.jsx)(`span`,{className:`text-xs text-muted`,children:t.status})]})},t.id)})}),(0,h.jsx)(`button`,{type:`button`,className:`w-full rounded border border-dashed border-border px-2 py-1 text-xs text-muted hover:border-border hover:text-foreground disabled:opacity-50`,onClick:()=>i(e.filePath),"data-testid":`sub-issue-add-button`,children:`+ サブIssue 追加`})]})};try{g.displayName=`buildChildRowList`,g.__docgenInfo={description:"`childFilePaths` の順序を保ちながら、各 path を `childTasks` から解決するか broken 行として残すかを決める。\n- `normalizeRefPathForLookup` で正規化したキーが `childTasks` の `normalizeTaskPathForLookup(filePath)` と一致すれば resolved\n  （空文字 / 絶対 path / Windows drive prefix は正規化が undefined を返すため、resolved にならず broken 扱いに回る）\n- resolved にできなかった path が `brokenChildPaths` に含まれていれば broken\n- どちらにも当たらない path はスキップ（過剰描画を防ぐ）",displayName:`buildChildRowList`,filePath:`/home/runner/work/spec-board/spec-board/src/features/detail/components/SubIssueSection/index.tsx`,methods:[],props:{},tags:{param:`childFilePaths 親 task の raw 参照配列
childTasks 解決済み子タスク
brokenChildPaths broken と判定された raw path 集合`,returns:`描画順に並んだ {@link ChildRow }`}}}catch{}try{_.displayName=`SubIssueSection`,_.__docgenInfo={description:`詳細（DetailScreen）内のサブIssue セクション。
子タスクの進捗と一覧、「+ サブIssue 追加」ボタンを表示する。`,displayName:`SubIssueSection`,filePath:`/home/runner/work/spec-board/spec-board/src/features/detail/components/SubIssueSection/index.tsx`,methods:[],props:{parentTask:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/detail/components/SubIssueSection/index.tsx`,name:`TypeLiteral`}],description:`親タスク`,name:`parentTask`,required:!0,tags:{},type:{name:`Task`}},childTasks:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/detail/components/SubIssueSection/index.tsx`,name:`TypeLiteral`}],description:`直接の子タスク一覧（<ul> リスト表示用）`,name:`childTasks`,required:!0,tags:{},type:{name:`readonly Task[]`}},subIssueCounts:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/detail/components/SubIssueSection/index.tsx`,name:`TypeLiteral`}],description:`全子孫の完了数 / 総数（BE projection 由来）`,name:`subIssueCounts`,required:!0,tags:{},type:{name:`SubIssueCounts`}},isDone:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/detail/components/SubIssueSection/index.tsx`,name:`TypeLiteral`}],description:`子タスクの完了判定（BE projection 由来）。`,name:`isDone`,required:!0,tags:{param:`filePath - 判定対象 task の filePath`,returns:`完了カラムに居れば true`},type:{name:`(filePath: string) => boolean`}},onAddSubIssue:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/detail/components/SubIssueSection/index.tsx`,name:`TypeLiteral`}],description:`「+ サブIssue 追加」ボタン押下時のコールバック。
親タスクのファイルパスを引数に受け取り、タスク作成フォームを開く想定。`,name:`onAddSubIssue`,required:!0,tags:{param:`parentFilePath - 親タスクのファイルパス`},type:{name:`(parentFilePath: string) => void`}},onChildClick:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/detail/components/SubIssueSection/index.tsx`,name:`TypeLiteral`}],description:`子タスクをクリックした際のコールバック（任意）。`,name:`onChildClick`,required:!1,tags:{param:`childId - 対象の子タスクID`},type:{name:`((childId: string) => void)`}},brokenChildPaths:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/detail/components/SubIssueSection/index.tsx`,name:`TypeLiteral`}],description:`\`parentTask.hierarchy.childFilePaths\` のうちリンク切れと判定された raw path 集合。
該当 path の行は WarningIcon + 「リンク切れ」テキスト + 取消線スタイルで表示する。
未指定時は broken 行を一切描画しない（後方互換）。`,name:`brokenChildPaths`,required:!1,tags:{},type:{name:`ReadonlySet<string>`}}},tags:{param:`props - {@link SubIssueSectionProps }`,returns:`サブIssue セクション要素`}}}catch{}})),y,b,x,S,C,w,T,E;t((()=>{l(),v(),y=c[0],b=c.filter(e=>e.hierarchy.parentFilePath===y.filePath),x={component:_,args:{parentTask:y,childTasks:[],subIssueCounts:{done:0,total:0},isDone:()=>!1,onAddSubIssue:()=>{}}},S={args:{childTasks:[],subIssueCounts:{done:0,total:0}}},C={args:{childTasks:b,subIssueCounts:{done:0,total:b.length}}},w={args:{childTasks:b,subIssueCounts:{done:0,total:b.length},onChildClick:()=>{}}},T={args:{childTasks:b,subIssueCounts:{done:2,total:b.length+2}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  args: {
    childTasks: [],
    subIssueCounts: {
      done: 0,
      total: 0
    }
  }
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  args: {
    childTasks,
    subIssueCounts: {
      done: 0,
      total: childTasks.length
    }
  }
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  args: {
    childTasks,
    subIssueCounts: {
      done: 0,
      total: childTasks.length
    },
    onChildClick: () => {}
  }
}`,...w.parameters?.docs?.source}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  args: {
    childTasks,
    // 直下子より子孫の方が多いケース（孫 2 件が完了済み）。
    subIssueCounts: {
      done: 2,
      total: childTasks.length + 2
    }
  }
}`,...T.parameters?.docs?.source}}},E=[`Empty`,`WithChildren`,`Clickable`,`WithDescendantsBeyondDirectChildren`]}))();export{w as Clickable,S as Empty,C as WithChildren,T as WithDescendantsBeyondDirectChildren,E as __namedExportsOrder,x as default};