import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,r,t as i}from"./BoardColumnProvider-BLzkjj_3.js";import{i as a,n as o,r as s}from"./test-fixtures-hBao_jFJ.js";var c,l,u,d,f,p,m,h;e((()=>{o(),n(),c=t(),{fn:l}=__STORYBOOK_MODULE_TEST__,u=()=>{let e=r();return(0,c.jsxs)(`dl`,{className:`grid max-w-sm grid-cols-2 gap-2 rounded border border-border p-4 text-sm`,children:[(0,c.jsx)(`dt`,{children:`カラム`}),(0,c.jsx)(`dd`,{children:e.existingNames().join(`, `)||`なし`}),(0,c.jsx)(`dt`,{children:`Todo件数`}),(0,c.jsx)(`dd`,{children:e.taskCountInColumn(`Todo`)}),(0,c.jsx)(`dt`,{children:`DnD`}),(0,c.jsx)(`dd`,{children:e.dndDisabled?`無効`:`有効`})]})},d={component:i,args:{columns:s,tasks:a,allTasks:a,onColumnReorder:l(),children:(0,c.jsx)(u,{})}},f={},p={args:{dndDisabled:!0}},m={args:{columns:[],tasks:[],allTasks:[]}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    dndDisabled: true
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    columns: [],
    tasks: [],
    allTasks: []
  }
}`,...m.parameters?.docs?.source}}},h=[`Default`,`AllProps`,`EdgeCases`]}))();export{p as AllProps,f as Default,m as EdgeCases,h as __namedExportsOrder,d as default};