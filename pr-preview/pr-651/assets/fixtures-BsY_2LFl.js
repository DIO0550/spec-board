import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./result-7c-baUo1.js";import{n as r,t as i}from"./task-D-P1wHzE.js";var a,o,s,c,l,u,d,f,p,m,h,g,_=e((()=>{r(),t(),{fn:a}=__STORYBOOK_MODULE_TEST__,o=(e={})=>i.fromPayload({id:`issue-7`,title:`カードのカラム間ドラッグ&ドロップ`,status:`In Progress`,priority:`High`,milestone:`v0.3`,due:`2026-08-20`,labels:[`feature`,`frontend`,`a11y`],links:[`tasks/watcher-debounce.md`],children:[`tasks/keyboard-dnd.md`],reverseLinks:[],body:`## 概要

カードを別のカラムへ移動できるようにする。

## 受け入れ基準

- [x] マウス操作
- [ ] キーボード操作

\`\`\`ts
const order = 1024;
\`\`\`

> ファイル監視との競合に注意する。`,filePath:`tasks/card-drag-drop.md`,extras:{author:`taro`,assignees:[`taro`,`hanako`]},warnings:[],...e}),s=o(),c=o({id:`parent`,title:`DnD と操作性向上`,filePath:`tasks/dnd-improvements.md`,links:[],children:[s.filePath]}),l=o({id:`child`,title:`キーボード DnD`,status:`Done`,parent:s.filePath,filePath:`tasks/keyboard-dnd.md`,links:[],children:[]}),u=[{name:`Todo`,order:0},{name:`In Progress`,order:1,color:`#d97706`},{name:`Done`,order:2,color:`#16a34a`}],d={onStatusChange:a(),onPriorityChange:a(),onLabelsChange:a(),onChangeDraft:a()},f={childTasks:[l],subIssueCounts:{done:1,total:2},isDone:e=>e===l.filePath},p={parent:!1,links:new Set,children:new Set,reverseLinks:new Set},m={isOpen:!1,isBusy:!1,requestDelete:a(),cancelDelete:a(),confirmDelete:a()},h=async()=>n.ok(s),g=async()=>n.ok(s)}));export{s as a,o as c,g as d,c as f,d as i,p as l,f as n,m as o,u as r,_ as s,l as t,h as u};