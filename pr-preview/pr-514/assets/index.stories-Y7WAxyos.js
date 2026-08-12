import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,t as r}from"./TaskCard-DwZyG3By.js";import{i,n as a,t as o}from"./test-fixtures-hBao_jFJ.js";import{n as s,t as c}from"./decorator-DU5PqSHE.js";var l,u,d,f,p,m,h,g,_,v,y,b,x,S,C,w,T,E,D,O,k,A,j,M,N;e((()=>{a(),c(),n(),l=t(),u=i[0],d={component:r,decorators:[s({tasks:i,allTasks:i,milestonesByName:new Map,doneColumn:`Done`,projections:o(i,`Done`)})],args:{task:u,childTasks:[],fromColumn:`Todo`}},f={},p={args:{onClick:()=>{}}},m={args:{hasBrokenLink:!0}},h={args:{task:{...u,priority:`High`,title:`高優先度のタスク`}}},g={args:{task:{...u,labels:[`bug`,`frontend`,`urgent`]}}},_=i.filter(e=>e.hierarchy.parentFilePath===u.filePath),v={args:{task:{...u},childTasks:_}},y={args:{task:{...u},childTasks:_}},b={args:{task:{...u,priority:void 0,labels:[],hierarchy:{...u.hierarchy,childFilePaths:[]},title:`最小構成のタスク`},childTasks:[]}},x={render:e=>(0,l.jsx)(r.Root,{...e,children:(0,l.jsx)(r.Header,{})})},S={render:e=>(0,l.jsx)(r.Root,{...e,children:(0,l.jsx)(r.Milestone,{})}),args:{task:{...u,milestone:`v1.0`}}},C={render:e=>(0,l.jsx)(r.Root,{...e,children:(0,l.jsx)(r.Labels,{})}),args:{task:{...u,labels:[`bug`,`urgent`]}}},w={render:e=>(0,l.jsx)(r.Root,{...e,children:(0,l.jsx)(r.Progress,{})}),args:{task:u,childTasks:_}},T={render:e=>(0,l.jsx)(r.Root,{...e,children:(0,l.jsx)(r.Footer,{})})},E={render:e=>(0,l.jsxs)(r.Root,{...e,children:[(0,l.jsx)(r.Header,{}),(0,l.jsx)(r.Milestone,{}),(0,l.jsx)(r.Labels,{}),(0,l.jsx)(r.Progress,{}),(0,l.jsx)(r.Footer,{})]}),args:{task:{...u,milestone:`v1.0`,labels:[`bug`,`urgent`]},childTasks:_}},D={render:e=>(0,l.jsxs)(r.Root,{...e,children:[(0,l.jsx)(r.Footer,{}),(0,l.jsx)(r.Header,{}),(0,l.jsx)(r.Labels,{})]}),args:{task:{...u,labels:[`bug`,`frontend`]}}},O={args:{task:{...u,milestone:`v1.0`,labels:[`bug`,`urgent`]}}},k={args:{task:{...u,draft:!0,title:`レビュー前の下書きタスク`}}},A={args:{task:{...u,title:`狭いカラムでも複数行に折り返して内容を確認できる長いタスクタイトル`,labels:[`frontend`,`accessibility`,`needs-review`,`blocked`]}}},j={...E},M={...A},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    onClick: () => {}
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    hasBrokenLink: true
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    task: {
      ...baseTask,
      priority: "High",
      title: "高優先度のタスク"
    }
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    task: {
      ...baseTask,
      labels: ["bug", "frontend", "urgent"]
    }
  }
}`,...g.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    task: {
      ...baseTask
    },
    childTasks
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    task: {
      ...baseTask
    },
    childTasks
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
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
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  render: args => <TaskCard.Root {...args}>
      <TaskCard.Header />
    </TaskCard.Root>
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  render: args => <TaskCard.Root {...args}>
      <TaskCard.Milestone />
    </TaskCard.Root>,
  args: {
    task: {
      ...baseTask,
      milestone: "v1.0"
    }
  }
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  render: args => <TaskCard.Root {...args}>
      <TaskCard.Labels />
    </TaskCard.Root>,
  args: {
    task: {
      ...baseTask,
      labels: ["bug", "urgent"]
    }
  }
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  render: args => <TaskCard.Root {...args}>
      <TaskCard.Progress />
    </TaskCard.Root>,
  args: {
    task: baseTask,
    childTasks
  }
}`,...w.parameters?.docs?.source}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  render: args => <TaskCard.Root {...args}>
      <TaskCard.Footer />
    </TaskCard.Root>
}`,...T.parameters?.docs?.source}}},E.parameters={...E.parameters,docs:{...E.parameters?.docs,source:{originalSource:`{
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
}`,...E.parameters?.docs?.source}}},D.parameters={...D.parameters,docs:{...D.parameters?.docs,source:{originalSource:`{
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
}`,...D.parameters?.docs?.source}}},O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{
  args: {
    task: {
      ...baseTask,
      milestone: "v1.0",
      labels: ["bug", "urgent"]
    }
  }
}`,...O.parameters?.docs?.source}}},k.parameters={...k.parameters,docs:{...k.parameters?.docs,source:{originalSource:`{
  args: {
    task: {
      ...baseTask,
      draft: true,
      title: "レビュー前の下書きタスク"
    }
  }
}`,...k.parameters?.docs?.source}}},A.parameters={...A.parameters,docs:{...A.parameters?.docs,source:{originalSource:`{
  args: {
    task: {
      ...baseTask,
      title: "狭いカラムでも複数行に折り返して内容を確認できる長いタスクタイトル",
      labels: ["frontend", "accessibility", "needs-review", "blocked"]
    }
  }
}`,...A.parameters?.docs?.source}}},j.parameters={...j.parameters,docs:{...j.parameters?.docs,source:{originalSource:`{
  ...CompoundFull
}`,...j.parameters?.docs?.source}}},M.parameters={...M.parameters,docs:{...M.parameters?.docs,source:{originalSource:`{
  ...LongContent
}`,...M.parameters?.docs?.source}}},N=[`Default`,`Clickable`,`WithBrokenLink`,`HighPriority`,`WithLabels`,`WithChildren`,`WithDescendantsBeyondDirectChildren`,`Minimal`,`HeaderOnly`,`MilestoneOnly`,`LabelsOnly`,`ProgressOnly`,`FooterOnly`,`CompoundFull`,`ReorderedFooterFirst`,`WithMilestoneAndLabels`,`Draft`,`LongContent`,`AllProps`,`EdgeCases`]}))();export{j as AllProps,p as Clickable,E as CompoundFull,f as Default,k as Draft,M as EdgeCases,T as FooterOnly,x as HeaderOnly,h as HighPriority,C as LabelsOnly,A as LongContent,S as MilestoneOnly,b as Minimal,w as ProgressOnly,D as ReorderedFooterFirst,m as WithBrokenLink,v as WithChildren,y as WithDescendantsBeyondDirectChildren,g as WithLabels,O as WithMilestoneAndLabels,N as __namedExportsOrder,d as default};