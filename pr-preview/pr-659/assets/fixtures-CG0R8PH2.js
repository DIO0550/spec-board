import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./result-DYUyfXdh.js";import{n as r,t as i}from"./task-DjrcEorc.js";import{n as a,t as o}from"./test-fixtures-BogoZePH.js";var s,c,l,u,d,f,p,m,h,g=e((()=>{a(),r(),t(),s=(e={})=>i.fromPayload({id:`issue-7`,title:`カードのカラム間ドラッグ&ドロップ`,status:`In Progress`,priority:`High`,milestone:`v0.3`,due:`2026-08-20`,labels:[`feature`,`frontend`,`a11y`],links:[`tasks/watcher-debounce.md`],children:[`tasks/keyboard-dnd.md`],reverseLinks:[],body:`## 概要

カードを別のカラムへ移動できるようにする。

## 受け入れ基準

- [x] マウス操作
- [ ] キーボード操作

\`\`\`ts
const order = 1024;
\`\`\`

> ファイル監視との競合に注意する。`,filePath:`tasks/card-drag-drop.md`,extras:{author:`taro`,assignees:[`taro`,`hanako`]},warnings:[],...e}),c=s(),l=s({id:`parent`,title:`DnD と操作性向上`,filePath:`tasks/dnd-improvements.md`,links:[],children:[c.filePath]}),u=s({id:`child`,title:`キーボード DnD`,status:`Done`,parent:c.filePath,filePath:`tasks/keyboard-dnd.md`,links:[],children:[]}),d=[l,c,u],f=o(d,`Done`),p=[{name:`Todo`,order:0},{name:`In Progress`,order:1,color:`#d97706`},{name:`Done`,order:2,color:`#16a34a`}],m=async()=>n.ok(c),h=async()=>n.ok(c)}));export{c as a,m as c,f as i,h as l,d as n,g as o,p as r,s,u as t,l as u};