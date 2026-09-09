import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{r as n,t as r}from"./label-definition-BpRSXVXS.js";import{n as i,t as a}from"./DetailFields-BE2p6_z5.js";import{a as o,c as s,d as c,i as l,n as u,r as d,s as f,u as p}from"./fixtures-C87-XXN4.js";var m,h,g,_,v,y;e((()=>{n(),f(),i(),m=t(),h={component:a,args:{task:o,columns:d,handlers:l,labelSuggestions:r.listFromWire([{name:`bug`,color:`red`},{name:`feature`,color:`blue`},{name:`docs`}]),children:null}},g={render:e=>(0,m.jsxs)(a,{...e,children:[(0,m.jsx)(a.StatusPriority,{}),(0,m.jsx)(a.Labels,{})]})},_={render:e=>(0,m.jsxs)(a,{...e,children:[(0,m.jsx)(a.StatusPriority,{}),(0,m.jsx)(a.Labels,{}),(0,m.jsx)(a.Draft,{}),(0,m.jsx)(a.SubIssue,{childInfo:u,brokenChildPaths:new Set,onAddSubIssue:()=>{}}),(0,m.jsx)(a.Links,{allTasks:[o,...u.childTasks],parentFilePath:null,childrenFilePaths:u.childTasks.map(e=>e.filePath),brokenLinkPaths:new Set,brokenReverseLinkPaths:new Set,onAddLink:p,onRemoveLink:c})]})},v={args:{task:s({draft:!0,labels:[],priority:void 0})},render:e=>(0,m.jsxs)(a,{...e,children:[(0,m.jsx)(a.StatusPriority,{}),(0,m.jsx)(a.Labels,{}),(0,m.jsx)(a.Draft,{})]})},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  render: args => <DetailFields {...args}>
      <DetailFields.StatusPriority />
      <DetailFields.Labels />
    </DetailFields>
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  render: args => <DetailFields {...args}>
      <DetailFields.StatusPriority />
      <DetailFields.Labels />
      <DetailFields.Draft />
      <DetailFields.SubIssue childInfo={detailChildInfo} brokenChildPaths={new Set()} onAddSubIssue={() => {}} />
      <DetailFields.Links allTasks={[detailTask, ...detailChildInfo.childTasks]} parentFilePath={null} childrenFilePaths={detailChildInfo.childTasks.map(task => task.filePath)} brokenLinkPaths={new Set()} brokenReverseLinkPaths={new Set()} onAddLink={noopAddLink} onRemoveLink={noopRemoveLink} />
    </DetailFields>
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
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
}`,...v.parameters?.docs?.source}}},y=[`Default`,`AllProps`,`EdgeCases`]}))();export{_ as AllProps,g as Default,v as EdgeCases,y as __namedExportsOrder,h as default};