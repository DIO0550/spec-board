import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{a as n,o as r}from"./TaskCardRoot-CmlFE_-7.js";import{n as i,t as a}from"./TaskCard-D_UIbXkA.js";import{i as o,n as s,t as c}from"./test-fixtures-Ck8nEBqB.js";var l,u,d,f,p,m,h,g,_;e((()=>{s(),i(),r(),l=t(),{fn:u}=__STORYBOOK_MODULE_TEST__,d=o[0],f=(0,l.jsx)(`div`,{className:`w-72`,children:(0,l.jsx)(a,{task:d,fromColumn:d.status,onClick:u()})}),p={component:n,args:{tasks:o,allTasks:o,doneColumn:`Done`,projections:c(o,`Done`),onTaskDrop:u(),children:f}},m={},h={args:{dndDisabled:!0,milestonesByName:new Map([[`v1.0`,{name:`v1.0`,title:`正式リリース`}]])}},g={args:{tasks:[],allTasks:[],projections:c([],`Done`),children:(0,l.jsx)(`p`,{className:`text-sm text-muted`,children:`Provider内にタスクがありません`})}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    dndDisabled: true,
    milestonesByName: new Map([["v1.0", {
      name: "v1.0",
      title: "正式リリース"
    }]])
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: [],
    allTasks: [],
    projections: buildProjectionsFixture([], "Done"),
    /** タスクが 0 件のときに Provider 配下へ描く children。 */
    children: <p className="text-sm text-muted">Provider内にタスクがありません</p>
  }
}`,...g.parameters?.docs?.source}}},_=[`Default`,`AllProps`,`EdgeCases`]}))();export{h as AllProps,m as Default,g as EdgeCases,_ as __namedExportsOrder,p as default};