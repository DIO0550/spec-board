import{a as e,n as t}from"./chunk-BneVvdWh.js";import{t as n}from"./iframe-DNnoL3rx.js";import{t as r}from"./jsx-runtime-Bn1Ys6_W.js";import{n as i,t as a}from"./CodeViewer-B8JwtUlP.js";import{n as o,t as s}from"./ConfigFileList-yJNpPhuU.js";var c,l,u,d,f=t((()=>{c=e(n(),1),i(),o(),l=r(),u=[{id:`config`,name:`config.json`,path:`.spec-board/config.json`,badge:`1.4 KB`,language:`JSON`,content:`{
  "version": 1,
  "columns": [
    { "name": "Backlog", "order": 0 },
    { "name": "Todo", "order": 1 },
    { "name": "In Progress", "order": 2 },
    { "name": "In Review", "order": 3 },
    { "name": "Done", "order": 4 }
  ],
  "doneColumn": "Done"
}`,generated:!1},{id:`guide`,name:`GUIDE.md`,path:`.spec-board/GUIDE.md`,badge:`自動生成`,language:`Markdown`,content:`<!-- このファイルは spec-board が自動生成します。 -->

# spec-board タスクフォーマットガイド

## 有効なステータス値

- Backlog
- Todo
- In Progress
- In Review
- Done`,generated:!0}],d=({files:e=u,initialFile:t=`config`,status:n=`ready`,error:r,isRegenerating:i=!1,toast:o,onCopy:d,onRegenerate:f,onOpenExternal:p,onRevealFolder:m})=>{let[h,g]=(0,c.useState)(t);if(n===`loading`)return(0,l.jsx)(`p`,{role:`status`,className:`text-sm text-muted`,children:`設定ファイルを読み込んでいます…`});if(n===`error`)return(0,l.jsxs)(`p`,{role:`alert`,className:`rounded-md border border-danger bg-danger-soft p-4 text-sm text-danger`,children:[`設定ファイルを読み込めませんでした: `,r??`不明なエラー`]});let _=e.find(e=>e.id===h)??e[0];return _===void 0?(0,l.jsx)(`p`,{className:`text-sm text-muted`,children:`設定ファイルがありません`}):(0,l.jsxs)(`section`,{className:`mx-auto flex w-full max-w-[1080px] flex-col gap-4`,"aria-labelledby":`config-file-title`,children:[(0,l.jsxs)(`header`,{className:`flex flex-wrap items-end gap-4`,children:[(0,l.jsx)(`h1`,{id:`config-file-title`,className:`m-0 text-[22px] font-semibold`,children:`設定ファイル`}),(0,l.jsxs)(`p`,{className:`flex gap-4 pb-1 text-xs text-muted`,children:[(0,l.jsxs)(`span`,{children:[(0,l.jsx)(`strong`,{className:`font-mono text-foreground`,children:e.length}),` `,`ファイル`]}),(0,l.jsxs)(`span`,{children:[`schema `,(0,l.jsx)(`strong`,{className:`font-mono text-foreground`,children:`v1`})]}),(0,l.jsxs)(`span`,{children:[`最終更新`,` `,(0,l.jsx)(`strong`,{className:`font-mono text-foreground`,children:`12秒前`})]})]}),(0,l.jsx)(`button`,{type:`button`,onClick:m,className:`ml-auto h-7 rounded-md border border-border px-2.5 text-xs font-medium`,children:`フォルダを開く`})]}),(0,l.jsxs)(`p`,{className:`m-0 max-w-[78ch] text-[12.5px] text-muted`,children:[`プロジェクト直下の`,` `,(0,l.jsx)(`code`,{className:`rounded border border-border bg-surface px-1 py-0.5 font-mono text-[11.5px] text-foreground`,children:`.spec-board/`}),` `,`に置かれる実ファイルです。ここは読み取り専用ビューです。`]}),(0,l.jsxs)(`div`,{className:`grid grid-cols-[230px_minmax(0,1fr)] items-start gap-4 max-[880px]:grid-cols-1`,children:[(0,l.jsx)(s,{files:e,selectedId:_.id,onSelect:g}),(0,l.jsx)(a,{file:_,onCopy:()=>d?.(_.id),onRegenerate:f,onOpenExternal:()=>p?.(_.id),isRegenerating:i})]}),o!==void 0&&(0,l.jsx)(`div`,{role:`status`,className:`fixed bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-foreground px-3.5 py-2 text-xs text-background`,children:o}),r!==void 0&&(0,l.jsx)(`div`,{role:`alert`,className:`rounded-md border border-danger bg-danger-soft px-3 py-2 text-xs text-danger`,children:r})]})};try{d.displayName=`ConfigFileTab`,d.__docgenInfo={description:``,displayName:`ConfigFileTab`,filePath:`/home/runner/work/spec-board/spec-board/src/features/settings/components/ConfigFileTab/index.tsx`,methods:[],props:{files:{defaultValue:{value:`[
  {
    id: "config",
    name: "config.json",
    path: ".spec-board/config.json",
    badge: "1.4 KB",
    language: "JSON",
    content: CONFIG_CONTENT,
    generated: false,
  },
  {
    id: "guide",
    name: "GUIDE.md",
    path: ".spec-board/GUIDE.md",
    badge: "自動生成",
    language: "Markdown",
    content: GUIDE_CONTENT,
    generated: true,
  },
]`},declarations:[{fileName:`spec-board/src/features/settings/components/ConfigFileTab/index.tsx`,name:`TypeLiteral`}],description:``,name:`files`,required:!1,tags:{},type:{name:`readonly ConfigFileDefinition[]`}},initialFile:{defaultValue:{value:`config`},declarations:[{fileName:`spec-board/src/features/settings/components/ConfigFileTab/index.tsx`,name:`TypeLiteral`}],description:``,name:`initialFile`,required:!1,tags:{},type:{name:`enum`,raw:`ConfigFileId`,value:[{value:`"config"`},{value:`"guide"`}]}},status:{defaultValue:{value:`ready`},declarations:[{fileName:`spec-board/src/features/settings/components/ConfigFileTab/index.tsx`,name:`TypeLiteral`}],description:``,name:`status`,required:!1,tags:{},type:{name:`enum`,raw:`"error" | "loading" | "ready"`,value:[{value:`"error"`},{value:`"loading"`},{value:`"ready"`}]}},error:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/settings/components/ConfigFileTab/index.tsx`,name:`TypeLiteral`}],description:``,name:`error`,required:!1,tags:{},type:{name:`string`}},isRegenerating:{defaultValue:{value:`false`},declarations:[{fileName:`spec-board/src/features/settings/components/ConfigFileTab/index.tsx`,name:`TypeLiteral`}],description:``,name:`isRegenerating`,required:!1,tags:{},type:{name:`boolean`}},toast:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/settings/components/ConfigFileTab/index.tsx`,name:`TypeLiteral`}],description:``,name:`toast`,required:!1,tags:{},type:{name:`string`}},onCopy:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/settings/components/ConfigFileTab/index.tsx`,name:`TypeLiteral`}],description:``,name:`onCopy`,required:!1,tags:{},type:{name:`((id: ConfigFileId) => void)`}},onRegenerate:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/settings/components/ConfigFileTab/index.tsx`,name:`TypeLiteral`}],description:``,name:`onRegenerate`,required:!1,tags:{},type:{name:`(() => void)`}},onOpenExternal:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/settings/components/ConfigFileTab/index.tsx`,name:`TypeLiteral`}],description:``,name:`onOpenExternal`,required:!1,tags:{},type:{name:`((id: ConfigFileId) => void)`}},onRevealFolder:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/settings/components/ConfigFileTab/index.tsx`,name:`TypeLiteral`}],description:``,name:`onRevealFolder`,required:!1,tags:{},type:{name:`(() => void)`}}},tags:{param:`props - ファイル内容とpresentational callbacks`,returns:`読み取り専用設定ファイル画面`}}}catch{}}));export{f as n,d as t};