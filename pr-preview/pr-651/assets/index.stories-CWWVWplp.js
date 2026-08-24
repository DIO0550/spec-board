import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./task-forest-DhQL5cj1.js";import{t as r}from"./jsx-runtime-Bn1Ys6_W.js";import{n as i,t as a}from"./ActiveBoardView-DtpuHzvQ.js";import{i as o,n as s,r as c,t as l}from"./test-fixtures-B9hSMIvn.js";var u,d,f,p,m,h,g,_,v,y;e((()=>{t(),s(),i(),u=r(),{fn:d}=__STORYBOOK_MODULE_TEST__,f=n.fromPayload(o.map(e=>({filePath:e.filePath,children:[]}))),p={projectName:`payments-service`,columns:c,tasks:o,doneColumn:`Done`,projections:l(o,`Done`),taskTree:f,milestones:[],onAddTask:d(),onTaskClick:d(),onAddColumn:d(),onRenameColumn:d(),onDeleteColumn:d(),onTaskDrop:d(),onColumnReorder:d()},m={component:a,args:{viewMode:`board`,filtered:o,filterActive:!1,workspace:p},parameters:{layout:`fullscreen`},decorators:[e=>(0,u.jsx)(`div`,{className:`h-screen`,children:(0,u.jsx)(e,{})})]},h={},g={args:{viewMode:`calendar`,filterActive:!0}},_={args:{viewMode:`list`,filtered:[],workspace:{...p,tasks:[]}}},v={args:{viewMode:`tree`,filtered:[],workspace:{...p,tasks:[],taskTree:n.empty}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    viewMode: "calendar",
    filterActive: true
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    viewMode: "list",
    filtered: [],
    workspace: {
      ...workspace,
      tasks: []
    }
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    viewMode: "tree",
    filtered: [],
    workspace: {
      ...workspace,
      tasks: [],
      taskTree: TaskForest.empty
    }
  }
}`,...v.parameters?.docs?.source}}},y=[`Default`,`AllProps`,`EdgeCases`,`Empty`]}))();export{g as AllProps,h as Default,_ as EdgeCases,v as Empty,y as __namedExportsOrder,m as default};