import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./Column-dYicbV3E.js";import{n as r,t as i}from"./task-bSS-Oy1E.js";import{i as a,n as o,t as s}from"./test-fixtures-Ck8nEBqB.js";import{n as c,t as l}from"./decorator-B__8e3ni.js";import{n as u,t as d}from"./decorator-W12ANF92.js";var f,p,m,h,g,_,v,y,b,x,S;e((()=>{o(),r(),d(),l(),t(),f=a.filter(e=>e.status===`Todo`),p={component:n,parameters:{layout:`centered`},decorators:[c({columns:[{name:`Todo`,order:0},{name:`In Progress`,order:1},{name:`Done`,order:2}],tasks:f,allTasks:a}),u({tasks:f,allTasks:a,milestonesByName:new Map,doneColumn:`Done`,projections:s(a,`Done`)})],args:{name:`Todo`,onAddTask:()=>{},onTaskClick:()=>{},onRenameColumn:()=>{},onDeleteColumn:()=>{}}},m={},h=[c({columns:[{name:`Todo`,order:0},{name:`In Progress`,order:1},{name:`Done`,order:2}],tasks:[],allTasks:[]}),u({tasks:[],allTasks:[],milestonesByName:new Map,doneColumn:`Done`,projections:s([],`Done`)})],g={decorators:h},_=Array.from({length:12},(e,t)=>i.fromPayload({id:`many-${t}`,title:`タスク ${t+1}`,status:`Todo`,priority:t%3==0?`High`:t%3==1?`Medium`:`Low`,labels:t%2==0?[`sample`]:[],parent:void 0,links:[],children:[],reverseLinks:[],body:``,filePath:`tasks/many-${t}.md`})),v={decorators:[c({columns:[{name:`Todo`,order:0},{name:`In Progress`,order:1},{name:`Done`,order:2}],tasks:_,allTasks:_}),u({tasks:_,allTasks:_,milestonesByName:new Map,doneColumn:`Done`,projections:s(_,`Done`)})]},y={args:{onDeleteColumn:void 0,onRenameColumn:void 0}},b={...v},x={...g},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{}`,...m.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  decorators: emptyDecorators
}`,...g.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  decorators: [withBoardColumnProvider({
    columns: [{
      name: "Todo",
      order: 0
    }, {
      name: "In Progress",
      order: 1
    }, {
      name: "Done",
      order: 2
    }],
    tasks: manyTasks,
    allTasks: manyTasks
  }), withBoardCardProvider({
    tasks: manyTasks,
    allTasks: manyTasks,
    milestonesByName: new Map(),
    doneColumn: "Done",
    projections: buildProjectionsFixture(manyTasks, "Done")
  })]
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    onDeleteColumn: undefined,
    onRenameColumn: undefined
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  ...ManyTasks
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  ...Empty
}`,...x.parameters?.docs?.source}}},S=[`Default`,`Empty`,`ManyTasks`,`WithoutMenu`,`AllProps`,`EdgeCases`]}))();export{b as AllProps,m as Default,x as EdgeCases,g as Empty,v as ManyTasks,y as WithoutMenu,S as __namedExportsOrder,p as default};