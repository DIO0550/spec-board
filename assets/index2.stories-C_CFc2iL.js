import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./task-Bznqpe7x.js";import{n as r,t as i}from"./decorator-DaPAmEWd.js";import{i as a,n as o,t as s}from"./test-fixtures-BHn6QY-n.js";import{n as c,t as l}from"./Column-AvMQXl1i.js";import{n as u,t as d}from"./decorator-BNJzimP5.js";var f,p,m,h,g,_,v,y,b;e((()=>{o(),t(),d(),i(),c(),f=a.filter(e=>e.status===`Todo`),p={component:l,parameters:{layout:`centered`},decorators:[r({columns:[{name:`Todo`,order:0},{name:`In Progress`,order:1},{name:`Done`,order:2}],tasks:f,allTasks:a}),u({tasks:f,allTasks:a,milestonesByName:new Map,doneColumn:`Done`,projections:s(a,`Done`)})],args:{name:`Todo`,onAddTask:()=>{},onTaskClick:()=>{},onRenameColumn:()=>{},onDeleteColumn:()=>{}}},m={},h=[r({columns:[{name:`Todo`,order:0},{name:`In Progress`,order:1},{name:`Done`,order:2}],tasks:[],allTasks:[]}),u({tasks:[],allTasks:[],milestonesByName:new Map,doneColumn:`Done`,projections:s([],`Done`)})],g={decorators:h},_=Array.from({length:12},(e,t)=>n.fromPayload({id:`many-${t}`,title:`タスク ${t+1}`,status:`Todo`,priority:t%3==0?`High`:t%3==1?`Medium`:`Low`,labels:t%2==0?[`sample`]:[],parent:void 0,links:[],children:[],reverseLinks:[],body:``,filePath:`tasks/many-${t}.md`})),v={decorators:[r({columns:[{name:`Todo`,order:0},{name:`In Progress`,order:1},{name:`Done`,order:2}],tasks:_,allTasks:_}),u({tasks:_,allTasks:_,milestonesByName:new Map,doneColumn:`Done`,projections:s(_,`Done`)})]},y={args:{onDeleteColumn:void 0,onRenameColumn:void 0}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{}`,...m.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
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
}`,...y.parameters?.docs?.source}}},b=[`Default`,`Empty`,`ManyTasks`,`WithoutMenu`]}))();export{m as Default,g as Empty,v as ManyTasks,y as WithoutMenu,b as __namedExportsOrder,p as default};