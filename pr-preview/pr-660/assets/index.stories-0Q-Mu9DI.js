import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{r as n,t as r}from"./label-definition-BpRSXVXS.js";import{n as i,t as a}from"./DetailFields-df4evaWU.js";import{a as o,c as s,i as c,l,n as u,o as d,r as f,s as p}from"./fixtures-CG0R8PH2.js";import{n as m,t as h}from"./decorator-Bjp63Gxk.js";var g,_,v,y,b,x,S,C;e((()=>{n(),h(),d(),i(),g=t(),{fn:_}=__STORYBOOK_MODULE_TEST__,v=r.listFromWire([{name:`bug`,color:`red`},{name:`feature`,color:`blue`},{name:`docs`}]),y={component:a,decorators:[m({task:o,columns:f,allTasks:u,projections:c,labelSuggestions:v,onAddSubIssue:_(),onAddLink:s,onRemoveLink:l})],args:{children:null}},b={render:()=>(0,g.jsxs)(a,{children:[(0,g.jsx)(a.StatusPriority,{}),(0,g.jsx)(a.Labels,{})]})},x={render:()=>(0,g.jsxs)(a,{children:[(0,g.jsx)(a.StatusPriority,{}),(0,g.jsx)(a.Labels,{}),(0,g.jsx)(a.Draft,{}),(0,g.jsx)(a.SubIssue,{}),(0,g.jsx)(a.Links,{})]})},S={decorators:[m({task:p({draft:!0,labels:[],priority:void 0}),columns:f,labelSuggestions:v})],render:()=>(0,g.jsxs)(a,{children:[(0,g.jsx)(a.StatusPriority,{}),(0,g.jsx)(a.Labels,{}),(0,g.jsx)(a.Draft,{})]})},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  render: () => <DetailFields>
      <DetailFields.StatusPriority />
      <DetailFields.Labels />
    </DetailFields>
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  render: () => <DetailFields>
      <DetailFields.StatusPriority />
      <DetailFields.Labels />
      <DetailFields.Draft />
      <DetailFields.SubIssue />
      <DetailFields.Links />
    </DetailFields>
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  decorators: [withDetailProvider({
    task: makeDetailTask({
      draft: true,
      labels: [],
      priority: undefined
    }),
    columns: detailColumns,
    labelSuggestions
  })],
  render: () => <DetailFields>
      <DetailFields.StatusPriority />
      <DetailFields.Labels />
      <DetailFields.Draft />
    </DetailFields>
}`,...S.parameters?.docs?.source}}},C=[`Default`,`AllProps`,`EdgeCases`]}))();export{x as AllProps,b as Default,S as EdgeCases,C as __namedExportsOrder,y as default};