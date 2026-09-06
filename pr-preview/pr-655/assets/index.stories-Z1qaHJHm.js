import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./task-forest-DhQL5cj1.js";import{n as r,t as i}from"./TreeView-BOFJDL-b.js";import{n as a,t as o}from"./task-DjrcEorc.js";import{i as s,n as c,r as l}from"./test-fixtures-BogoZePH.js";var u,d,f,p,m,h,g,_,v,y,b,x,S;e((()=>{t(),c(),a(),r(),{fn:u}=__STORYBOOK_MODULE_TEST__,d={component:i,args:{tasks:s,taskTree:n.fromPayload([{filePath:s[0].filePath,children:[{filePath:s[2].filePath,children:[]}]},...s.slice(1).filter(e=>e.id!==s[2].id).map(e=>({filePath:e.filePath,children:[]}))]),columns:l,projectName:`payments-service`,doneColumn:`Done`,onAddTask:u(),onTaskClick:u()},parameters:{layout:`fullscreen`}},f={},p={args:{tasks:s.map((e,t)=>({...e,due:t===0?`2026-09-30`:e.due}))}},m={args:{tasks:[s[0]],taskTree:n.empty}},h={args:{tasks:[],taskTree:n.empty}},g={args:{defaultExpanded:!0}},_={args:{defaultExpanded:!1}},v={args:{tasks:[s[3]],taskTree:n.fromPayload([{filePath:s[3].filePath,children:[]}])}},y=Array.from({length:6},(e,t)=>o.fromPayload({id:`deep-${t}`,title:`深い階層 ${t+1}`,filePath:`tasks/deep-${t}.md`,status:s[0].status,labels:s[0].labels,body:s[0].body,parent:t===0?void 0:`tasks/deep-${t-1}.md`,children:t===5?[]:[`tasks/deep-${t+1}.md`],links:s[0].links.linkedFilePaths,reverseLinks:s[0].links.reverseLinkedFilePaths})),b=n.fromPayload([]);for(let e=y.length-1;e>=0;--e)b=n.fromPayload([{filePath:y[e].filePath,children:b}]);x={args:{tasks:y,taskTree:b}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: initialTasks.map((task, index) => ({
      ...task,
      due: index === 0 ? "2026-09-30" : task.due
    }))
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: [initialTasks[0]],
    taskTree: TaskForest.empty
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: [],
    taskTree: TaskForest.empty
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    defaultExpanded: true
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    defaultExpanded: false
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: [initialTasks[3]],
    taskTree: TaskForest.fromPayload([{
      filePath: initialTasks[3].filePath,
      children: []
    }])
  }
}`,...v.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: deepTasks,
    taskTree: deepTree
  }
}`,...x.parameters?.docs?.source}}},S=[`Default`,`AllProps`,`EdgeCases`,`Empty`,`Expanded`,`Collapsed`,`Done`,`DeepNesting`]}))();export{p as AllProps,_ as Collapsed,x as DeepNesting,f as Default,v as Done,m as EdgeCases,h as Empty,g as Expanded,S as __namedExportsOrder,d as default};