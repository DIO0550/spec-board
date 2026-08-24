import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./ListView-Du2FFRDQ.js";import{i as r,n as i,r as a}from"./test-fixtures-Ck8nEBqB.js";var o,s,c,l,u,d,f,p,m;e((()=>{i(),t(),{fn:o}=__STORYBOOK_MODULE_TEST__,s={component:n,args:{tasks:r,columns:a,doneColumn:`Done`,onTaskClick:o(),onAddTask:o()},parameters:{layout:`fullscreen`}},c={},l={args:{tasks:r.map((e,t)=>({...e,due:`2026-09-${String(t+10).padStart(2,`0`)}`})),selectedTaskId:r[1].id}},u={args:{tasks:[{...r[0],title:`非常に長いタイトルを持つタスク`.repeat(8),labels:Array.from({length:8},(e,t)=>`label-${t+1}`)}]}},d={args:{selectedTaskId:r[0].id}},f={args:{tasks:[]}},p={args:{tasks:[],columns:[],filterActive:!0}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: initialTasks.map((task, index) => ({
      ...task,
      due: \`2026-09-\${String(index + 10).padStart(2, "0")}\`
    })),
    selectedTaskId: initialTasks[1].id
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: [{
      ...initialTasks[0],
      title: "非常に長いタイトルを持つタスク".repeat(8),
      labels: Array.from({
        length: 8
      }, (_, index) => \`label-\${index + 1}\`)
    }]
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    selectedTaskId: initialTasks[0].id
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: []
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: [],
    columns: [],
    filterActive: true
  }
}`,...p.parameters?.docs?.source}}},m=[`Default`,`AllProps`,`EdgeCases`,`Active`,`Empty`,`NoResults`]}))();export{d as Active,l as AllProps,c as Default,u as EdgeCases,f as Empty,p as NoResults,m as __namedExportsOrder,s as default};