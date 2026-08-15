import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{i as n,n as r,r as i,t as a}from"./BoardProviders-gn-XqwN5.js";import{i as o,n as s,r as c,t as l}from"./test-fixtures-hBao_jFJ.js";var u,d,f,p,m,h,g,_;e((()=>{s(),n(),r(),u=t(),{fn:d}=__STORYBOOK_MODULE_TEST__,f=(0,u.jsx)(i,{children:c.map((e,t)=>(0,u.jsx)(i.Column,{name:e.name,order:t,onAddTask:d(),onTaskClick:d()},e.name))}),p={component:a,args:{columns:c,tasks:o,allTasks:o,doneColumn:`Done`,projections:l(o,`Done`),onTaskDrop:d(),onColumnReorder:d(),children:f},parameters:{layout:`fullscreen`},decorators:[e=>(0,u.jsx)(`div`,{className:`h-screen`,children:(0,u.jsx)(e,{})})]},m={},h={args:{dndDisabled:!0,milestonesByName:new Map}},g={args:{columns:[],tasks:[],allTasks:[],projections:l([],`Done`),children:(0,u.jsx)(`p`,{className:`p-4 text-sm text-muted`,children:`空のProvider`})}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    dndDisabled: true,
    milestonesByName: new Map()
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    columns: [],
    tasks: [],
    allTasks: [],
    projections: buildProjectionsFixture([], "Done"),
    children: <p className="p-4 text-sm text-muted">空のProvider</p>
  }
}`,...g.parameters?.docs?.source}}},_=[`Default`,`AllProps`,`EdgeCases`]}))();export{h as AllProps,m as Default,g as EdgeCases,_ as __namedExportsOrder,p as default};