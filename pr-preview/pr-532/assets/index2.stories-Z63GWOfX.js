import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,t as r}from"./MilestoneSettingsTab-ChSy_eTk.js";var i,a,o,s,c,l,u,d,f,p;e((()=>{n(),i=t(),{fn:a}=__STORYBOOK_MODULE_TEST__,o={milestones:[{name:`v1`,title:`Version 1`,due:`2026-09-30`,state:`open`}],usageCounts:{v1:8},byName:new Map,status:`loaded`,reload:a(async()=>{})},s={isPending:!1,create:a(async()=>!0),update:a(async()=>!0),remove:a(async()=>null)},c={component:r,args:{resource:o,milestoneProjections:new Map,mutations:s},decorators:[e=>(0,i.jsx)(`div`,{className:`mx-auto max-w-[1080px] p-6`,children:(0,i.jsx)(e,{})})]},l={},u={args:{mutations:{...s,isPending:!0}}},d={args:{resource:{...o,milestones:[],usageCounts:{},byName:new Map}}},f={args:{resource:{...o,milestones:[],status:`loading`}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    mutations: {
      ...mutations,
      isPending: true
    }
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    resource: {
      ...resource,
      milestones: [],
      usageCounts: {},
      byName: new Map()
    }
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    resource: {
      ...resource,
      milestones: [],
      status: "loading"
    }
  }
}`,...f.parameters?.docs?.source}}},p=[`Default`,`AllProps`,`EdgeCases`,`Loading`]}))();export{u as AllProps,l as Default,d as EdgeCases,f as Loading,p as __namedExportsOrder,c as default};