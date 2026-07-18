import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-B6lWK8m9.js";import{r as n,t as r}from"./test-fixtures-CuQ6Lg2w.js";import{n as i,t as a}from"./TaskCard-Cst3mkMw.js";import{n as o,t as s}from"./decorator-oOa7XWyf.js";var c,l,u,d,f,p,m,h,g,_,v,y,b,x,S,C,w,T,E,D,O;e((()=>{r(),s(),i(),c=t(),l=n[0],u={component:a,decorators:[o({tasks:n,allTasks:n,milestonesByName:new Map,doneColumn:`Done`})],args:{task:l,childTasks:[],fromColumn:`Todo`}},d={},f={args:{onClick:()=>{}}},p={args:{hasBrokenLink:!0}},m={args:{task:{...l,priority:`High`,title:`高優先度のタスク`}}},h={args:{task:{...l,labels:[`bug`,`frontend`,`urgent`]}}},g=n.filter(e=>e.hierarchy.parentFilePath===l.filePath),_={args:{task:{...l},childTasks:g}},v={args:{task:{...l},childTasks:g}},y={args:{task:{...l,priority:void 0,labels:[],hierarchy:{...l.hierarchy,childFilePaths:[]},title:`最小構成のタスク`},childTasks:[]}},b={render:e=>(0,c.jsx)(a.Root,{...e,children:(0,c.jsx)(a.Header,{})})},x={render:e=>(0,c.jsx)(a.Root,{...e,children:(0,c.jsx)(a.Milestone,{})}),args:{task:{...l,milestone:`v1.0`}}},S={render:e=>(0,c.jsx)(a.Root,{...e,children:(0,c.jsx)(a.Labels,{})}),args:{task:{...l,labels:[`bug`,`urgent`]}}},C={render:e=>(0,c.jsx)(a.Root,{...e,children:(0,c.jsx)(a.Progress,{})}),args:{task:l,childTasks:g}},w={render:e=>(0,c.jsx)(a.Root,{...e,children:(0,c.jsx)(a.Footer,{})})},T={render:e=>(0,c.jsxs)(a.Root,{...e,children:[(0,c.jsx)(a.Header,{}),(0,c.jsx)(a.Milestone,{}),(0,c.jsx)(a.Labels,{}),(0,c.jsx)(a.Progress,{}),(0,c.jsx)(a.Footer,{})]}),args:{task:{...l,milestone:`v1.0`,labels:[`bug`,`urgent`]},childTasks:g}},E={render:e=>(0,c.jsxs)(a.Root,{...e,children:[(0,c.jsx)(a.Footer,{}),(0,c.jsx)(a.Header,{}),(0,c.jsx)(a.Labels,{})]}),args:{task:{...l,labels:[`bug`,`frontend`]}}},D={args:{task:{...l,milestone:`v1.0`,labels:[`bug`,`urgent`]}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    onClick: () => {}
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    hasBrokenLink: true
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    task: {
      ...baseTask,
      priority: "High",
      title: "高優先度のタスク"
    }
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    task: {
      ...baseTask,
      labels: ["bug", "frontend", "urgent"]
    }
  }
}`,...h.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    task: {
      ...baseTask
    },
    childTasks
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    task: {
      ...baseTask
    },
    childTasks
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    task: {
      ...baseTask,
      priority: undefined,
      labels: [],
      hierarchy: {
        ...baseTask.hierarchy,
        childFilePaths: []
      },
      title: "最小構成のタスク"
    },
    childTasks: []
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  render: args => <TaskCard.Root {...args}>
      <TaskCard.Header />
    </TaskCard.Root>
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  render: args => <TaskCard.Root {...args}>
      <TaskCard.Milestone />
    </TaskCard.Root>,
  args: {
    task: {
      ...baseTask,
      milestone: "v1.0"
    }
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  render: args => <TaskCard.Root {...args}>
      <TaskCard.Labels />
    </TaskCard.Root>,
  args: {
    task: {
      ...baseTask,
      labels: ["bug", "urgent"]
    }
  }
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  render: args => <TaskCard.Root {...args}>
      <TaskCard.Progress />
    </TaskCard.Root>,
  args: {
    task: baseTask,
    childTasks
  }
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  render: args => <TaskCard.Root {...args}>
      <TaskCard.Footer />
    </TaskCard.Root>
}`,...w.parameters?.docs?.source}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  render: args => <TaskCard.Root {...args}>
      <TaskCard.Header />
      <TaskCard.Milestone />
      <TaskCard.Labels />
      <TaskCard.Progress />
      <TaskCard.Footer />
    </TaskCard.Root>,
  args: {
    task: {
      ...baseTask,
      milestone: "v1.0",
      labels: ["bug", "urgent"]
    },
    childTasks
  }
}`,...T.parameters?.docs?.source}}},E.parameters={...E.parameters,docs:{...E.parameters?.docs,source:{originalSource:`{
  render: args => <TaskCard.Root {...args}>
      <TaskCard.Footer />
      <TaskCard.Header />
      <TaskCard.Labels />
    </TaskCard.Root>,
  args: {
    task: {
      ...baseTask,
      labels: ["bug", "frontend"]
    }
  }
}`,...E.parameters?.docs?.source}}},D.parameters={...D.parameters,docs:{...D.parameters?.docs,source:{originalSource:`{
  args: {
    task: {
      ...baseTask,
      milestone: "v1.0",
      labels: ["bug", "urgent"]
    }
  }
}`,...D.parameters?.docs?.source}}},O=[`Default`,`Clickable`,`WithBrokenLink`,`HighPriority`,`WithLabels`,`WithChildren`,`WithDescendantsBeyondDirectChildren`,`Minimal`,`HeaderOnly`,`MilestoneOnly`,`LabelsOnly`,`ProgressOnly`,`FooterOnly`,`CompoundFull`,`ReorderedFooterFirst`,`WithMilestoneAndLabels`]}))();export{f as Clickable,T as CompoundFull,d as Default,w as FooterOnly,b as HeaderOnly,m as HighPriority,S as LabelsOnly,x as MilestoneOnly,y as Minimal,C as ProgressOnly,E as ReorderedFooterFirst,p as WithBrokenLink,_ as WithChildren,v as WithDescendantsBeyondDirectChildren,h as WithLabels,D as WithMilestoneAndLabels,O as __namedExportsOrder,u as default};