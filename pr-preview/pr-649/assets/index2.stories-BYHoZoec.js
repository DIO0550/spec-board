import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./task-forest-M8xuchDN.js";import{t as r}from"./jsx-runtime-Bn1Ys6_W.js";import{n as i,t as a}from"./BoardWorkspace-CaUiaHHZ.js";import{i as o,n as s,r as c,t as l}from"./test-fixtures-BoFO4AXL.js";var u,d,f,p,m,h,g,_,v;e((()=>{t(),s(),i(),u=r(),{fn:d}=__STORYBOOK_MODULE_TEST__,f=n.fromPayload(o.map(e=>({filePath:e.filePath,children:[]}))),p={component:a,args:{columns:c,tasks:o,doneColumn:`Done`,projections:l(o,`Done`),taskTree:f,milestones:[{name:`v1.0`,title:`正式リリース`}],milestonesByName:new Map,onAddTask:d(),onTaskClick:d(),onAddColumn:d(),onRenameColumn:d(),onDeleteColumn:d(),onTaskDrop:d(),onColumnReorder:d(),onLabelFilterApplied:d()},parameters:{layout:`fullscreen`},decorators:[e=>(0,u.jsx)(`div`,{className:`h-screen`,children:(0,u.jsx)(e,{})})]},m={},h={args:{initialLabelFilter:`frontend`}},g={args:{columns:[],tasks:[],taskTree:n.empty,projections:l([],`Done`),milestones:[]}},_={args:{tasks:[],taskTree:n.empty,projections:l([],`Done`)}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    initialLabelFilter: "frontend"
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    columns: [],
    tasks: [],
    taskTree: TaskForest.empty,
    projections: buildProjectionsFixture([], "Done"),
    milestones: []
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: [],
    taskTree: TaskForest.empty,
    projections: buildProjectionsFixture([], "Done")
  }
}`,..._.parameters?.docs?.source}}},v=[`Default`,`AllProps`,`EdgeCases`,`Empty`]}))();export{h as AllProps,m as Default,g as EdgeCases,_ as Empty,v as __namedExportsOrder,p as default};