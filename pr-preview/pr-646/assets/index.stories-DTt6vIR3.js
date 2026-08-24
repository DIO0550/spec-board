import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,t as r}from"./DetailFields-qj9Frdzq.js";import{a as i,c as a,d as o,i as s,n as c,r as l,s as u,u as d}from"./fixtures-D7aYxHpx.js";var f,p,m,h,g,_;e((()=>{u(),n(),f=t(),p={component:r,args:{task:i,columns:l,handlers:s,children:null}},m={render:e=>(0,f.jsxs)(r,{...e,children:[(0,f.jsx)(r.StatusPriority,{}),(0,f.jsx)(r.Labels,{})]})},h={render:e=>(0,f.jsxs)(r,{...e,children:[(0,f.jsx)(r.StatusPriority,{}),(0,f.jsx)(r.Labels,{}),(0,f.jsx)(r.Draft,{}),(0,f.jsx)(r.SubIssue,{childInfo:c,brokenChildPaths:new Set,onAddSubIssue:()=>{}}),(0,f.jsx)(r.Links,{allTasks:[i,...c.childTasks],parentFilePath:null,childrenFilePaths:c.childTasks.map(e=>e.filePath),brokenLinkPaths:new Set,brokenReverseLinkPaths:new Set,onAddLink:d,onRemoveLink:o})]})},g={args:{task:a({draft:!0,labels:[],priority:void 0})},render:e=>(0,f.jsxs)(r,{...e,children:[(0,f.jsx)(r.StatusPriority,{}),(0,f.jsx)(r.Labels,{}),(0,f.jsx)(r.Draft,{})]})},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: args => <DetailFields {...args}>
      <DetailFields.StatusPriority />
      <DetailFields.Labels />
    </DetailFields>
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  render: args => <DetailFields {...args}>
      <DetailFields.StatusPriority />
      <DetailFields.Labels />
      <DetailFields.Draft />
      <DetailFields.SubIssue childInfo={detailChildInfo} brokenChildPaths={new Set()} onAddSubIssue={() => {}} />
      <DetailFields.Links allTasks={[detailTask, ...detailChildInfo.childTasks]} parentFilePath={null} childrenFilePaths={detailChildInfo.childTasks.map(task => task.filePath)} brokenLinkPaths={new Set()} brokenReverseLinkPaths={new Set()} onAddLink={noopAddLink} onRemoveLink={noopRemoveLink} />
    </DetailFields>
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    task: makeDetailTask({
      draft: true,
      labels: [],
      priority: undefined
    })
  },
  render: args => <DetailFields {...args}>
      <DetailFields.StatusPriority />
      <DetailFields.Labels />
      <DetailFields.Draft />
    </DetailFields>
}`,...g.parameters?.docs?.source}}},_=[`Default`,`AllProps`,`EdgeCases`]}))();export{h as AllProps,m as Default,g as EdgeCases,_ as __namedExportsOrder,p as default};