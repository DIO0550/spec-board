import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,t as r}from"./task-D-P1wHzE.js";import{n as i,t as a}from"./MilestoneViewScreen-DNxukE1Y.js";import{n as o,t as s}from"./taskFixtures-DNkWkUiU.js";var c,l,u,d,f,p,m,h,g,_,v,y,b,x,S,C,w,T,E,D,O,k,A,j,M,N,P,F,I,L;e((()=>{s(),n(),i(),c=t(),{fn:l,userEvent:u,within:d}=__STORYBOOK_MODULE_TEST__,f=[{name:`v1.5`,title:`v1.5 — 検索 & フィルター`,description:`全文検索とラベル/期日複合フィルタの実装`,due:`2026-07-10`,state:`open`,order:1},{name:`v1.6`,title:`v1.6 — 通知センター`,description:`メンション通知とリアルタイム配信`,due:`2026-08-25`,state:`open`,order:2},{name:`v1.7`,title:`v1.7 — レポート`,description:`進捗バーンダウンと月次サマリエクスポート`,due:`2026-10-05`,state:`open`,order:3},{name:`sprint-24`,title:`Sprint 24 — 安定化`,description:`クラッシュ修正と回帰テスト整備`,due:`2026-06-18`,state:`open`,order:4},{name:`v1.4`,title:`v1.4 — リリース済`,description:`ボード機能の安定化リリース`,due:`2026-05-31`,state:`closed`,order:5},{name:`ops-2026q3`,title:`Ops 2026Q3`,description:`監視・SLO 改善`,due:`2026-09-01`,state:`open`,order:6}],p=(e,t,n,i)=>{let a={id:e,title:t,status:i,milestone:n,labels:[],links:[],children:[],reverseLinks:[],body:``,filePath:`${e}.md`,extras:{},warnings:[]};return r.fromPayload(a)},m=[p(`v15-1`,`全文検索バックエンド`,`v1.5`,`Doing`),p(`v15-2`,`フィルタ UI`,`v1.5`,`Done`),p(`v15-3`,`ラベル絞り込み`,`v1.5`,`Todo`),p(`v15-4`,`Q1 振り返り`,`v1.5`,`Done`),p(`v16-1`,`通知 schema`,`v1.6`,`Todo`),p(`v16-2`,`メール送信`,`v1.6`,`Todo`),p(`v17-1`,`バーンダウン算出`,`v1.7`,`Todo`),p(`v17-2`,`PDF エクスポート`,`v1.7`,`Todo`),p(`s24-1`,`クラッシュ再現`,`sprint-24`,`Done`),p(`s24-2`,`回帰テスト追加`,`sprint-24`,`Doing`),p(`v14-1`,`リリースノート`,`v1.4`,`Done`),p(`v14-2`,`本番デプロイ`,`v1.4`,`Done`),p(`ops-1`,`メトリクス整理`,`ops-2026q3`,`Todo`)],h=new Map([[`v1.5`,{done:2,total:4,taskFilePaths:[o(`v15-1.md`),o(`v15-2.md`),o(`v15-3.md`),o(`v15-4.md`)]}],[`v1.6`,{done:0,total:2,taskFilePaths:[o(`v16-1.md`),o(`v16-2.md`)]}],[`v1.7`,{done:0,total:2,taskFilePaths:[o(`v17-1.md`),o(`v17-2.md`)]}],[`sprint-24`,{done:1,total:2,taskFilePaths:[o(`s24-1.md`),o(`s24-2.md`)]}],[`v1.4`,{done:2,total:2,taskFilePaths:[o(`v14-1.md`),o(`v14-2.md`)]}],[`ops-2026q3`,{done:0,total:1,taskFilePaths:[o(`ops-1.md`)]}]]),g={subIssueProgress:{done:0,total:0},isDone:!0,childFilePaths:[]},_=new Map([[o(`v15-2.md`),g],[o(`v15-4.md`),g],[o(`s24-1.md`),g],[o(`v14-1.md`),g],[o(`v14-2.md`),g]]),v=()=>Promise.resolve(),y={status:`loaded`,milestones:f,byName:new Map(f.map(e=>[e.name,e])),usageCounts:Object.fromEntries(m.reduce((e,t)=>(t.milestone!==void 0&&e.set(t.milestone,(e.get(t.milestone)??0)+1),e),new Map)),reload:v},b={status:`loaded`,milestones:[],byName:new Map,usageCounts:{},reload:v},x={status:`loading`,milestones:[],byName:new Map,usageCounts:{},reload:v},S={status:`error`,milestones:[],byName:new Map,usageCounts:{},error:`読み込みに失敗しました`,reload:v},C=[{name:`unused`,title:`未使用`,state:`open`,order:0},{name:`__proto__`,title:`特殊名`,state:`open`,order:1}],w={status:`loaded`,milestones:C,byName:new Map(C.map(e=>[e.name,e])),usageCounts:{},reload:v},T=[p(`special`,`特殊 key のタスク`,`__proto__`,`Todo`)],E={component:a,parameters:{layout:`fullscreen`},args:{resource:y,tasks:m,doneColumn:`Done`,milestoneProjections:h,taskProjections:_,onTaskClick:l(),now:new Date(`2026-04-15T12:00:00Z`)}},D={},O={args:{onCreateMilestone:l(async()=>!0),onTaskClick:l(),isCreating:!1,now:new Date(`2026-04-15T12:00:00Z`)}},k={args:{doneColumn:void 0}},A={args:{resource:w,tasks:T,milestoneProjections:new Map([[`__proto__`,{done:0,total:1,taskFilePaths:[o(`special.md`)]}],[`unknown-from-task`,{done:1,total:2,taskFilePaths:[o(`unknown-a.md`),o(`unknown-b.md`)]}]]),taskProjections:new Map}},j={args:{resource:b,tasks:[]}},M={args:{resource:x,tasks:[]}},N={args:{resource:S,tasks:[]}},P={args:{onCreateMilestone:l(async()=>!0),isCreating:!1}},F={decorators:[e=>(0,c.jsxs)(`div`,{className:`h-screen overflow-hidden bg-background`,children:[(0,c.jsxs)(`header`,{className:`flex h-12 items-center border-b border-border bg-surface px-4 text-sm font-semibold`,children:[`spec-board`,` `,(0,c.jsx)(`span`,{className:`ml-4 font-mono text-xs text-muted`,children:`payments-service · milestones.yml`}),(0,c.jsx)(`span`,{className:`ml-auto text-xs text-muted`,children:`同期中 · 監視 127 files`})]}),(0,c.jsxs)(`nav`,{"aria-label":`マイルストーン設定`,className:`flex h-11 items-center gap-4 border-b border-border bg-surface px-4 text-xs`,children:[(0,c.jsx)(`button`,{type:`button`,children:`戻る`}),(0,c.jsx)(`strong`,{children:`プロジェクト設定`}),(0,c.jsx)(`span`,{className:`ml-auto text-accent`,children:`マイルストーン`})]}),(0,c.jsx)(e,{})]})]},I={...F,play:async({canvasElement:e})=>{let t=d(e);await u.click(t.getAllByTestId(`milestone-view-row`)[0]),await u.click(t.getByTestId(`milestone-view-roadmap`))}},D.parameters={...D.parameters,docs:{...D.parameters?.docs,source:{originalSource:`{}`,...D.parameters?.docs?.source},description:{story:`デザインモック準拠の標準表示。一覧モード・未選択。`,...D.parameters?.docs?.description}}},O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{
  args: {
    onCreateMilestone: fn(async () => true),
    onTaskClick: fn(),
    isCreating: false,
    now: new Date("2026-04-15T12:00:00Z")
  }
}`,...O.parameters?.docs?.source}}},k.parameters={...k.parameters,docs:{...k.parameters?.docs,source:{originalSource:`{
  args: {
    doneColumn: undefined
  }
}`,...k.parameters?.docs?.source},description:{story:`done カラム未解決（doneColumn = undefined）— 進捗バーが非表示になる。`,...k.parameters?.docs?.description}}},A.parameters={...A.parameters,docs:{...A.parameters?.docs,source:{originalSource:`{
  args: {
    resource: EDGE_RESOURCE,
    tasks: EDGE_TASKS,
    milestoneProjections: new Map([["__proto__", {
      done: 0,
      total: 1,
      taskFilePaths: [taskFilePathFixture("special.md")]
    }], ["unknown-from-task", {
      done: 1,
      total: 2,
      taskFilePaths: [taskFilePathFixture("unknown-a.md"), taskFilePathFixture("unknown-b.md")]
    }]]),
    taskProjections: new Map()
  }
}`,...A.parameters?.docs?.source},description:{story:`未使用 definition、特殊名、definition のない参照を同時に確認する境界 story。`,...A.parameters?.docs?.description}}},j.parameters={...j.parameters,docs:{...j.parameters?.docs,source:{originalSource:`{
  args: {
    resource: EMPTY_RESOURCE,
    tasks: []
  }
}`,...j.parameters?.docs?.source},description:{story:`マイルストーン 0 件。`,...j.parameters?.docs?.description}}},M.parameters={...M.parameters,docs:{...M.parameters?.docs,source:{originalSource:`{
  args: {
    resource: LOADING_RESOURCE,
    tasks: []
  }
}`,...M.parameters?.docs?.source},description:{story:`読み込み中。`,...M.parameters?.docs?.description}}},N.parameters={...N.parameters,docs:{...N.parameters?.docs,source:{originalSource:`{
  args: {
    resource: ERROR_RESOURCE,
    tasks: []
  }
}`,...N.parameters?.docs?.source},description:{story:`読み込みエラー。`,...N.parameters?.docs?.description}}},P.parameters={...P.parameters,docs:{...P.parameters?.docs,source:{originalSource:`{
  args: {
    onCreateMilestone: fn(async () => true),
    isCreating: false
  }
}`,...P.parameters?.docs?.source},description:{story:`追加導線あり — ヘッダ右に「マイルストーンを追加」ボタンが出現し、
クリックで作成モーダルが開く。`,...P.parameters?.docs?.description}}},F.parameters={...F.parameters,docs:{...F.parameters?.docs,source:{originalSource:`{
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
}`,...F.parameters?.docs?.source}}},I.parameters={...I.parameters,docs:{...I.parameters?.docs,source:{originalSource:`{
  ...ReferenceShell,
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getAllByTestId("milestone-view-row")[0]);
    await userEvent.click(canvas.getByTestId("milestone-view-roadmap"));
  }
}`,...I.parameters?.docs?.source}}},L=[`Default`,`AllProps`,`WithoutDoneColumn`,`EdgeCases`,`Empty`,`Loading`,`ErrorState`,`WithCreateAction`,`ReferenceShell`,`SelectedRoadmapFullShell`]}))();export{O as AllProps,D as Default,A as EdgeCases,j as Empty,N as ErrorState,M as Loading,F as ReferenceShell,I as SelectedRoadmapFullShell,P as WithCreateAction,k as WithoutDoneColumn,L as __namedExportsOrder,E as default};