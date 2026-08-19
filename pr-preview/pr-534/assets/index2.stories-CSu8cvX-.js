import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,t as r}from"./task-8OoHF6Tq.js";import{n as i,t as a}from"./MilestoneViewScreen-1dPj5S18.js";var o,s,c,l,u,d,f,p,m,h,g,_,v,y,b,x,S,C,w,T,E,D,O,k,A,j,M,N,P,F;e((()=>{n(),i(),o=t(),{fn:s,userEvent:c,within:l}=__STORYBOOK_MODULE_TEST__,u=[{name:`v1.5`,title:`v1.5 — 検索 & フィルター`,description:`全文検索とラベル/期日複合フィルタの実装`,due:`2026-07-10`,state:`open`,order:1},{name:`v1.6`,title:`v1.6 — 通知センター`,description:`メンション通知とリアルタイム配信`,due:`2026-08-25`,state:`open`,order:2},{name:`v1.7`,title:`v1.7 — レポート`,description:`進捗バーンダウンと月次サマリエクスポート`,due:`2026-10-05`,state:`open`,order:3},{name:`sprint-24`,title:`Sprint 24 — 安定化`,description:`クラッシュ修正と回帰テスト整備`,due:`2026-06-18`,state:`open`,order:4},{name:`v1.4`,title:`v1.4 — リリース済`,description:`ボード機能の安定化リリース`,due:`2026-05-31`,state:`closed`,order:5},{name:`ops-2026q3`,title:`Ops 2026Q3`,description:`監視・SLO 改善`,due:`2026-09-01`,state:`open`,order:6}],d=(e,t,n,i)=>{let a={id:e,title:t,status:i,milestone:n,labels:[],links:[],children:[],reverseLinks:[],body:``,filePath:`${e}.md`,extras:{},warnings:[]};return r.fromPayload(a)},f=[d(`v15-1`,`全文検索バックエンド`,`v1.5`,`Doing`),d(`v15-2`,`フィルタ UI`,`v1.5`,`Done`),d(`v15-3`,`ラベル絞り込み`,`v1.5`,`Todo`),d(`v15-4`,`Q1 振り返り`,`v1.5`,`Done`),d(`v16-1`,`通知 schema`,`v1.6`,`Todo`),d(`v16-2`,`メール送信`,`v1.6`,`Todo`),d(`v17-1`,`バーンダウン算出`,`v1.7`,`Todo`),d(`v17-2`,`PDF エクスポート`,`v1.7`,`Todo`),d(`s24-1`,`クラッシュ再現`,`sprint-24`,`Done`),d(`s24-2`,`回帰テスト追加`,`sprint-24`,`Doing`),d(`v14-1`,`リリースノート`,`v1.4`,`Done`),d(`v14-2`,`本番デプロイ`,`v1.4`,`Done`),d(`ops-1`,`メトリクス整理`,`ops-2026q3`,`Todo`)],p=new Map([[`v1.5`,{done:2,total:4,taskFilePaths:[`v15-1.md`,`v15-2.md`,`v15-3.md`,`v15-4.md`]}],[`v1.6`,{done:0,total:2,taskFilePaths:[`v16-1.md`,`v16-2.md`]}],[`v1.7`,{done:0,total:2,taskFilePaths:[`v17-1.md`,`v17-2.md`]}],[`sprint-24`,{done:1,total:2,taskFilePaths:[`s24-1.md`,`s24-2.md`]}],[`v1.4`,{done:2,total:2,taskFilePaths:[`v14-1.md`,`v14-2.md`]}],[`ops-2026q3`,{done:0,total:1,taskFilePaths:[`ops-1.md`]}]]),m={subIssueProgress:{done:0,total:0},isDone:!0,childFilePaths:[]},h=new Map([[`v15-2.md`,m],[`v15-4.md`,m],[`s24-1.md`,m],[`v14-1.md`,m],[`v14-2.md`,m]]),g=()=>Promise.resolve(),_={status:`loaded`,milestones:u,byName:new Map(u.map(e=>[e.name,e])),usageCounts:Object.fromEntries(f.reduce((e,t)=>(t.milestone!==void 0&&e.set(t.milestone,(e.get(t.milestone)??0)+1),e),new Map)),reload:g},v={status:`loaded`,milestones:[],byName:new Map,usageCounts:{},reload:g},y={status:`loading`,milestones:[],byName:new Map,usageCounts:{},reload:g},b={status:`error`,milestones:[],byName:new Map,usageCounts:{},error:`読み込みに失敗しました`,reload:g},x=[{name:`unused`,title:`未使用`,state:`open`,order:0},{name:`__proto__`,title:`特殊名`,state:`open`,order:1}],S={status:`loaded`,milestones:x,byName:new Map(x.map(e=>[e.name,e])),usageCounts:{},reload:g},C=[d(`special`,`特殊 key のタスク`,`__proto__`,`Todo`)],w={component:a,parameters:{layout:`fullscreen`},args:{resource:_,tasks:f,doneColumn:`Done`,milestoneProjections:p,taskProjections:h,onTaskClick:s(),now:new Date(`2026-04-15T12:00:00Z`)}},T={},E={args:{onCreateMilestone:s(async()=>!0),onTaskClick:s(),isCreating:!1,now:new Date(`2026-04-15T12:00:00Z`)}},D={args:{doneColumn:void 0}},O={args:{resource:S,tasks:C,milestoneProjections:new Map([[`__proto__`,{done:0,total:1,taskFilePaths:[`special.md`]}],[`unknown-from-task`,{done:1,total:2,taskFilePaths:[`unknown-a.md`,`unknown-b.md`]}]]),taskProjections:new Map}},k={args:{resource:v,tasks:[]}},A={args:{resource:y,tasks:[]}},j={args:{resource:b,tasks:[]}},M={args:{onCreateMilestone:s(async()=>!0),isCreating:!1}},N={decorators:[e=>(0,o.jsxs)(`div`,{className:`h-screen overflow-hidden bg-background`,children:[(0,o.jsxs)(`header`,{className:`flex h-12 items-center border-b border-border bg-surface px-4 text-sm font-semibold`,children:[`spec-board`,` `,(0,o.jsx)(`span`,{className:`ml-4 font-mono text-xs text-muted`,children:`payments-service · milestones.yml`}),(0,o.jsx)(`span`,{className:`ml-auto text-xs text-muted`,children:`同期中 · 監視 127 files`})]}),(0,o.jsxs)(`nav`,{"aria-label":`マイルストーン設定`,className:`flex h-11 items-center gap-4 border-b border-border bg-surface px-4 text-xs`,children:[(0,o.jsx)(`button`,{type:`button`,children:`戻る`}),(0,o.jsx)(`strong`,{children:`プロジェクト設定`}),(0,o.jsx)(`span`,{className:`ml-auto text-accent`,children:`マイルストーン`})]}),(0,o.jsx)(e,{})]})]},P={...N,play:async({canvasElement:e})=>{let t=l(e);await c.click(t.getAllByTestId(`milestone-view-row`)[0]),await c.click(t.getByTestId(`milestone-view-roadmap`))}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{}`,...T.parameters?.docs?.source},description:{story:`デザインモック準拠の標準表示。一覧モード・未選択。`,...T.parameters?.docs?.description}}},E.parameters={...E.parameters,docs:{...E.parameters?.docs,source:{originalSource:`{
  args: {
    onCreateMilestone: fn(async () => true),
    onTaskClick: fn(),
    isCreating: false,
    now: new Date("2026-04-15T12:00:00Z")
  }
}`,...E.parameters?.docs?.source}}},D.parameters={...D.parameters,docs:{...D.parameters?.docs,source:{originalSource:`{
  args: {
    doneColumn: undefined
  }
}`,...D.parameters?.docs?.source},description:{story:`done カラム未解決（doneColumn = undefined）— 進捗バーが非表示になる。`,...D.parameters?.docs?.description}}},O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{
  args: {
    resource: EDGE_RESOURCE,
    tasks: EDGE_TASKS,
    milestoneProjections: new Map([["__proto__", {
      done: 0,
      total: 1,
      taskFilePaths: ["special.md"]
    }], ["unknown-from-task", {
      done: 1,
      total: 2,
      taskFilePaths: ["unknown-a.md", "unknown-b.md"]
    }]]),
    taskProjections: new Map()
  }
}`,...O.parameters?.docs?.source},description:{story:`未使用 definition、特殊名、definition のない参照を同時に確認する境界 story。`,...O.parameters?.docs?.description}}},k.parameters={...k.parameters,docs:{...k.parameters?.docs,source:{originalSource:`{
  args: {
    resource: EMPTY_RESOURCE,
    tasks: []
  }
}`,...k.parameters?.docs?.source},description:{story:`マイルストーン 0 件。`,...k.parameters?.docs?.description}}},A.parameters={...A.parameters,docs:{...A.parameters?.docs,source:{originalSource:`{
  args: {
    resource: LOADING_RESOURCE,
    tasks: []
  }
}`,...A.parameters?.docs?.source},description:{story:`読み込み中。`,...A.parameters?.docs?.description}}},j.parameters={...j.parameters,docs:{...j.parameters?.docs,source:{originalSource:`{
  args: {
    resource: ERROR_RESOURCE,
    tasks: []
  }
}`,...j.parameters?.docs?.source},description:{story:`読み込みエラー。`,...j.parameters?.docs?.description}}},M.parameters={...M.parameters,docs:{...M.parameters?.docs,source:{originalSource:`{
  args: {
    onCreateMilestone: fn(async () => true),
    isCreating: false
  }
}`,...M.parameters?.docs?.source},description:{story:`追加導線あり — ヘッダ右に「マイルストーンを追加」ボタンが出現し、
クリックで作成モーダルが開く。`,...M.parameters?.docs?.description}}},N.parameters={...N.parameters,docs:{...N.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <div className="h-screen overflow-hidden bg-background">
        <header className="flex h-12 items-center border-b border-border bg-surface px-4 text-sm font-semibold">
          spec-board{" "}
          <span className="ml-4 font-mono text-xs text-muted">
            payments-service · milestones.yml
          </span>
          <span className="ml-auto text-xs text-muted">
            同期中 · 監視 127 files
          </span>
        </header>
        <nav aria-label="マイルストーン設定" className="flex h-11 items-center gap-4 border-b border-border bg-surface px-4 text-xs">
          <button type="button">戻る</button>
          <strong>プロジェクト設定</strong>
          <span className="ml-auto text-accent">マイルストーン</span>
        </nav>
        <Story />
      </div>]
}`,...N.parameters?.docs?.source}}},P.parameters={...P.parameters,docs:{...P.parameters?.docs,source:{originalSource:`{
  ...ReferenceShell,
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getAllByTestId("milestone-view-row")[0]);
    await userEvent.click(canvas.getByTestId("milestone-view-roadmap"));
  }
}`,...P.parameters?.docs?.source}}},F=[`Default`,`AllProps`,`WithoutDoneColumn`,`EdgeCases`,`Empty`,`Loading`,`ErrorState`,`WithCreateAction`,`ReferenceShell`,`SelectedRoadmapFullShell`]}))();export{E as AllProps,T as Default,O as EdgeCases,k as Empty,j as ErrorState,A as Loading,N as ReferenceShell,P as SelectedRoadmapFullShell,M as WithCreateAction,D as WithoutDoneColumn,F as __namedExportsOrder,w as default};