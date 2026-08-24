import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./BoardView-Biod4lrV.js";import{i as r,n as i,r as a,t as o}from"./test-fixtures-Ck8nEBqB.js";var s,c,l,u,d,f,p;e((()=>{i(),t(),{fn:s}=__STORYBOOK_MODULE_TEST__,c={component:n,args:{columns:a,filtered:r,allTasks:r,filterActive:!1,doneColumn:`Done`,projections:o(r,`Done`),onAddTask:s(),onTaskClick:s(),onAddColumn:s(),onRenameColumn:s(),onDeleteColumn:s(),onTaskDrop:s(),onColumnReorder:s()},parameters:{layout:`fullscreen`}},l={},u={args:{filterActive:!0,milestonesByName:new Map([[`v1.0`,{name:`v1.0`,title:`正式リリース`}]])}},d={args:{columns:[{name:`Todo`,order:0}],filtered:[],allTasks:[],projections:o([],`Done`)}},f={args:{filtered:[],allTasks:[],projections:o([],`Done`)}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    filterActive: true,
    milestonesByName: new Map([["v1.0", {
      name: "v1.0",
      title: "正式リリース"
    }]])
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    columns: [{
      name: "Todo",
      order: 0
    }],
    filtered: [],
    allTasks: [],
    projections: buildProjectionsFixture([], "Done")
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    filtered: [],
    allTasks: [],
    projections: buildProjectionsFixture([], "Done")
  }
}`,...f.parameters?.docs?.source}}},p=[`Default`,`AllProps`,`EdgeCases`,`Empty`]}))();export{u as AllProps,l as Default,d as EdgeCases,f as Empty,p as __namedExportsOrder,c as default};