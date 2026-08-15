import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./task-forest-M8xuchDN.js";import{n as r,t as i}from"./TreeView-B64peFm4.js";import{i as a,n as o,r as s}from"./test-fixtures-hBao_jFJ.js";var c,l,u,d,f,p,m,h,g,_,v,y,b;e((()=>{t(),o(),r(),{fn:c}=__STORYBOOK_MODULE_TEST__,l={component:i,args:{tasks:a,taskTree:n.fromPayload([{filePath:a[0].filePath,children:[{filePath:a[2].filePath,children:[]}]},...a.slice(1).filter(e=>e.id!==a[2].id).map(e=>({filePath:e.filePath,children:[]}))]),columns:s,projectName:`payments-service`,doneColumn:`Done`,onAddTask:c(),onTaskClick:c()},parameters:{layout:`fullscreen`}},u={},d={args:{tasks:a.map((e,t)=>({...e,due:t===0?`2026-09-30`:e.due}))}},f={args:{tasks:[a[0]],taskTree:n.empty}},p={args:{tasks:[],taskTree:n.empty}},m={args:{defaultExpanded:!0}},h={args:{defaultExpanded:!1}},g={args:{tasks:[a[3]],taskTree:n.fromPayload([{filePath:a[3].filePath,children:[]}])}},_=Array.from({length:6},(e,t)=>({...a[0],id:`deep-${t}`,title:`深い階層 ${t+1}`,filePath:`tasks/deep-${t}.md`,hierarchy:{parentFilePath:t===0?void 0:`tasks/deep-${t-1}.md`,childFilePaths:t===5?[]:[`tasks/deep-${t+1}.md`]}})),v=n.fromPayload([]);for(let e=_.length-1;e>=0;--e)v=n.fromPayload([{filePath:_[e].filePath,children:v}]);y={args:{tasks:_,taskTree:v}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: initialTasks.map((task, index) => ({
      ...task,
      due: index === 0 ? "2026-09-30" : task.due
    }))
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: [initialTasks[0]],
    taskTree: TaskForest.empty
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: [],
    taskTree: TaskForest.empty
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    defaultExpanded: true
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    defaultExpanded: false
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: [initialTasks[3]],
    taskTree: TaskForest.fromPayload([{
      filePath: initialTasks[3].filePath,
      children: []
    }])
  }
}`,...g.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: deepTasks,
    taskTree: deepTree
  }
}`,...y.parameters?.docs?.source}}},b=[`Default`,`AllProps`,`EdgeCases`,`Empty`,`Expanded`,`Collapsed`,`Done`,`DeepNesting`]}))();export{d as AllProps,h as Collapsed,y as DeepNesting,u as Default,g as Done,f as EdgeCases,p as Empty,m as Expanded,b as __namedExportsOrder,l as default};