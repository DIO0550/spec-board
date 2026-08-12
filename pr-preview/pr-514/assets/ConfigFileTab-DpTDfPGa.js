import{a as e,n as t}from"./chunk-BneVvdWh.js";import{t as n}from"./iframe-Cp9rF3_9.js";import{t as r}from"./jsx-runtime-Bn1Ys6_W.js";import{n as i,t as a}from"./CodeViewer-WLdmid38.js";import{n as o,t as s}from"./ConfigFileList-BvJsHBje.js";var c,l,u,d,f=t((()=>{c=e(n(),1),i(),o(),l=r(),u=[{id:`config`,name:`config.json`,path:`.spec-board/config.json`,badge:`1.4 KB`,language:`JSON`,content:`{
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
- Done`,generated:!0}],d=({files:e=u,initialFile:t=`config`,toast:n,onCopy:r,onRegenerate:i,onOpenExternal:o,onRevealFolder:d})=>{let[f,p]=(0,c.useState)(t),m=e.find(e=>e.id===f)??e[0];return m===void 0?(0,l.jsx)(`p`,{className:`text-sm text-muted`,children:`設定ファイルがありません`}):(0,l.jsxs)(`section`,{className:`mx-auto flex w-full max-w-[1080px] flex-col gap-4`,"aria-labelledby":`config-file-title`,children:[(0,l.jsxs)(`header`,{className:`flex flex-wrap items-end gap-4`,children:[(0,l.jsx)(`h1`,{id:`config-file-title`,className:`m-0 text-[22px] font-semibold`,children:`設定ファイル`}),(0,l.jsxs)(`p`,{className:`flex gap-4 pb-1 text-xs text-muted`,children:[(0,l.jsxs)(`span`,{children:[(0,l.jsx)(`strong`,{className:`font-mono text-foreground`,children:e.length}),` `,`ファイル`]}),(0,l.jsxs)(`span`,{children:[`schema `,(0,l.jsx)(`strong`,{className:`font-mono text-foreground`,children:`v1`})]}),(0,l.jsxs)(`span`,{children:[`最終更新`,` `,(0,l.jsx)(`strong`,{className:`font-mono text-foreground`,children:`12秒前`})]})]}),(0,l.jsx)(`button`,{type:`button`,onClick:d,className:`ml-auto h-7 rounded-md border border-border px-2.5 text-xs font-medium`,children:`フォルダを開く`})]}),(0,l.jsxs)(`p`,{className:`m-0 max-w-[78ch] text-[12.5px] text-muted`,children:[`プロジェクト直下の`,` `,(0,l.jsx)(`code`,{className:`rounded border border-border bg-surface px-1 py-0.5 font-mono text-[11.5px] text-foreground`,children:`.spec-board/`}),` `,`に置かれる実ファイルです。ここは読み取り専用ビューです。`]}),(0,l.jsxs)(`div`,{className:`grid grid-cols-[230px_minmax(0,1fr)] items-start gap-4 max-[880px]:grid-cols-1`,children:[(0,l.jsx)(s,{files:e,selectedId:m.id,onSelect:p}),(0,l.jsx)(a,{file:m,onCopy:()=>r?.(m.id),onRegenerate:i,onOpenExternal:()=>o?.(m.id)})]}),n!==void 0&&(0,l.jsx)(`div`,{role:`status`,className:`fixed bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-foreground px-3.5 py-2 text-xs text-background`,children:n})]})};try{d.displayName=`ConfigFileTab`,d.__docgenInfo={description:``,displayName:`ConfigFileTab`,filePath:`/home/runner/work/spec-board/spec-board/src/features/settings/components/ConfigFileTab/index.tsx`,methods:[],props:{files:{defaultValue:{value:`[
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
]`},declarations:[{fileName:`spec-board/src/features/settings/components/ConfigFileTab/index.tsx`,name:`TypeLiteral`}],description:``,name:`files`,required:!1,tags:{},type:{name:`readonly ConfigFileDefinition[]`}},initialFile:{defaultValue:{value:`config`},declarations:[{fileName:`spec-board/src/features/settings/components/ConfigFileTab/index.tsx`,name:`TypeLiteral`}],description:``,name:`initialFile`,required:!1,tags:{},type:{name:`enum`,raw:`ConfigFileId`,value:[{value:`"config"`},{value:`"guide"`}]}},toast:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/settings/components/ConfigFileTab/index.tsx`,name:`TypeLiteral`}],description:``,name:`toast`,required:!1,tags:{},type:{name:`string`}},onCopy:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/settings/components/ConfigFileTab/index.tsx`,name:`TypeLiteral`}],description:``,name:`onCopy`,required:!1,tags:{},type:{name:`((id: ConfigFileId) => void)`}},onRegenerate:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/settings/components/ConfigFileTab/index.tsx`,name:`TypeLiteral`}],description:``,name:`onRegenerate`,required:!1,tags:{},type:{name:`(() => void)`}},onOpenExternal:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/settings/components/ConfigFileTab/index.tsx`,name:`TypeLiteral`}],description:``,name:`onOpenExternal`,required:!1,tags:{},type:{name:`((id: ConfigFileId) => void)`}},onRevealFolder:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/settings/components/ConfigFileTab/index.tsx`,name:`TypeLiteral`}],description:``,name:`onRevealFolder`,required:!1,tags:{},type:{name:`(() => void)`}}},tags:{param:`props - ファイル内容とpresentational callbacks`,returns:`読み取り専用設定ファイル画面`}}}catch{}}));export{f as n,d as t};