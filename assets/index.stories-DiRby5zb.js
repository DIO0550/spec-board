import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{a as n,n as r,o as i,t as a}from"./TaskCardRoot-vEEPdrgb.js";import{n as o,t as s}from"./TaskCardHeader-CIad5BS3.js";import{i as c,n as l,t as u}from"./test-fixtures-Ck8nEBqB.js";var d,f,p,m,h,g,_,v;e((()=>{l(),i(),r(),o(),d=t(),{fn:f}=__STORYBOOK_MODULE_TEST__,p=c[0],m={component:s,decorators:[e=>(0,d.jsx)(n,{tasks:c,allTasks:c,projections:u(c,`Done`),doneColumn:`Done`,children:(0,d.jsx)(a,{task:p,fromColumn:p.status,onClick:f(),children:(0,d.jsx)(e,{})})})]},h={},g={decorators:[e=>(0,d.jsx)(n,{tasks:c,allTasks:c,projections:u(c,`Done`),children:(0,d.jsx)(a,{task:{...p,draft:!0,due:`2026-09-30`},fromColumn:p.status,hasBrokenLink:!0,hasParseError:!0,children:(0,d.jsx)(e,{})})})]},_={decorators:[e=>(0,d.jsx)(n,{tasks:c,allTasks:c,projections:u(c,`Done`),children:(0,d.jsx)(a,{task:{...p,title:``,priority:void 0,due:void 0},fromColumn:p.status,children:(0,d.jsx)(e,{})})})]},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <BoardCardProvider tasks={initialTasks} allTasks={initialTasks} projections={buildProjectionsFixture(initialTasks, "Done")}>
        <TaskCardRoot task={{
      ...baseTask,
      draft: true,
      due: "2026-09-30"
    }} fromColumn={baseTask.status} hasBrokenLink hasParseError>
          <Story />
        </TaskCardRoot>
      </BoardCardProvider>]
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <BoardCardProvider tasks={initialTasks} allTasks={initialTasks} projections={buildProjectionsFixture(initialTasks, "Done")}>
        <TaskCardRoot task={{
      ...baseTask,
      title: "",
      priority: undefined,
      due: undefined
    }} fromColumn={baseTask.status}>
          <Story />
        </TaskCardRoot>
      </BoardCardProvider>]
}`,..._.parameters?.docs?.source}}},v=[`Default`,`AllProps`,`EdgeCases`]}))();export{g as AllProps,h as Default,_ as EdgeCases,v as __namedExportsOrder,m as default};