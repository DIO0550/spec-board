import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-B6lWK8m9.js";import{n,t as r}from"./shell-BlGMNNEX.js";var i,a,o=e((()=>{r(),i=t(),a=({view:e=`board`,onSettingsClick:t,onMilestoneClick:r,onOpenClick:a})=>(0,i.jsx)(`header`,{className:`flex items-center justify-end border-b border-border bg-surface px-4 py-2`,children:(0,i.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,i.jsx)(n,{}),r&&(0,i.jsx)(`button`,{type:`button`,onClick:r,className:`rounded px-3 py-1.5 text-sm text-muted hover:bg-surface-muted`,children:e===`milestone`?`ボードへ戻る`:`マイルストーン`}),(0,i.jsx)(`button`,{type:`button`,onClick:t,className:`rounded px-3 py-1.5 text-sm text-muted hover:bg-surface-muted`,children:e===`settings`?`ボードへ戻る`:`設定`}),(0,i.jsx)(`button`,{type:`button`,onClick:a,className:`rounded bg-accent px-3 py-1.5 text-sm text-accent-foreground hover:brightness-95`,children:`開く`})]})});try{a.displayName=`HeaderBar`,a.__docgenInfo={description:`ボード上部のヘッダーバー。
プロジェクト名見出しはサイドバー（ProjectSwitcher）へ集約したため持たないが、
テーマのライト ⇔ ダーク クイックトグルは spec（board-view-spec）に従いヘッダーに保持する。
残りはビュー固有アクション（マイルストーン切替 / 設定 / 開く）を右寄せで表示する。`,displayName:`HeaderBar`,filePath:`/home/runner/work/spec-board/spec-board/src/features/board/components/HeaderBar/index.tsx`,methods:[],props:{view:{defaultValue:{value:`board`},declarations:[{fileName:`spec-board/src/features/board/components/HeaderBar/index.tsx`,name:`TypeLiteral`}],description:`現在の画面区分。settings 中のみ「ボードへ戻る」表記に切替（board / detail は「設定」、既定 board）`,name:`view`,required:!1,tags:{},type:{name:`enum`,raw:`AppView`,value:[{value:`"board"`},{value:`"settings"`},{value:`"detail"`},{value:`"milestone"`},{value:`"create"`}]}},onSettingsClick:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/board/components/HeaderBar/index.tsx`,name:`TypeLiteral`}],description:`設定ボタンのクリックハンドラ`,name:`onSettingsClick`,required:!0,tags:{},type:{name:`() => void`}},onMilestoneClick:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/board/components/HeaderBar/index.tsx`,name:`TypeLiteral`}],description:`マイルストーンビュー切替ボタンのクリックハンドラ。
未指定（プロジェクト未オープン等）のときはボタンを表示しない。`,name:`onMilestoneClick`,required:!1,tags:{},type:{name:`(() => void)`}},onOpenClick:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/board/components/HeaderBar/index.tsx`,name:`TypeLiteral`}],description:`「開く」ボタンのクリックハンドラ`,name:`onOpenClick`,required:!0,tags:{},type:{name:`() => void`}}},tags:{param:`props - {@link HeaderBarProps }`,returns:`ヘッダーバー要素`}}}catch{}})),s,c,l,u,d;e((()=>{o(),s={component:a,parameters:{layout:`fullscreen`},args:{onSettingsClick:()=>{},onOpenClick:()=>{}}},c={args:{view:`board`}},l={args:{view:`settings`}},u={args:{view:`board`,onMilestoneClick:()=>{}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    view: "board"
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    view: "settings"
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    view: "board",
    onMilestoneClick: () => {}
  }
}`,...u.parameters?.docs?.source}}},d=[`BoardView`,`SettingsView`,`WithMilestone`]}))();export{c as BoardView,l as SettingsView,u as WithMilestone,d as __namedExportsOrder,s as default};