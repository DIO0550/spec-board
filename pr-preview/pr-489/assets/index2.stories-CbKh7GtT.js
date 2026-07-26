import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./task-_q2yRc2s.js";import{n as r,t as i}from"./decorator-CB7NgpPo.js";import{r as a,t as o}from"./test-fixtures-BfyglxFz.js";import{n as s,t as c}from"./Column-bxE1riuY.js";import{n as l,t as u}from"./decorator-BIOdJgHi.js";var d,f,p,m,h,g,_,v,y;e((()=>{o(),t(),u(),i(),s(),d=a.filter(e=>e.status===`Todo`),f={component:c,parameters:{layout:`centered`},decorators:[r({columns:[{name:`Todo`,order:0},{name:`In Progress`,order:1},{name:`Done`,order:2}],tasks:d,allTasks:a}),l({tasks:d,allTasks:a,milestonesByName:new Map,doneColumn:`Done`})],args:{name:`Todo`,onAddTask:()=>{},onTaskClick:()=>{},onRenameColumn:()=>{},onDeleteColumn:()=>{}}},p={},m=[r({columns:[{name:`Todo`,order:0},{name:`In Progress`,order:1},{name:`Done`,order:2}],tasks:[],allTasks:[]}),l({tasks:[],allTasks:[],milestonesByName:new Map,doneColumn:`Done`})],h={decorators:m},g=Array.from({length:12},(e,t)=>n.fromPayload({id:`many-${t}`,title:`タスク ${t+1}`,status:`Todo`,priority:t%3==0?`High`:t%3==1?`Medium`:`Low`,labels:t%2==0?[`sample`]:[],parent:void 0,links:[],children:[],reverseLinks:[],body:``,filePath:`tasks/many-${t}.md`})),_={decorators:[r({columns:[{name:`Todo`,order:0},{name:`In Progress`,order:1},{name:`Done`,order:2}],tasks:g,allTasks:g}),l({tasks:g,allTasks:g,milestonesByName:new Map,doneColumn:`Done`})]},v={args:{onDeleteColumn:void 0,onRenameColumn:void 0}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{}`,...p.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  decorators: emptyDecorators
}`,...h.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
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
    doneColumn: "Done"
  })]
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    onDeleteColumn: undefined,
    onRenameColumn: undefined
  }
}`,...v.parameters?.docs?.source}}},y=[`Default`,`Empty`,`ManyTasks`,`WithoutMenu`]}))();export{p as Default,h as Empty,_ as ManyTasks,v as WithoutMenu,y as __namedExportsOrder,f as default};