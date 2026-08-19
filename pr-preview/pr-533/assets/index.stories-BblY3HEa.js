import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{a as n,t as r}from"./broken-link-BLyODHKL.js";import{n as i,t as a}from"./result-7c-baUo1.js";import{n as o,t as s}from"./test-fixtures-hBao_jFJ.js";import{n as c,t as l}from"./DetailScreen-nFLaB0wd.js";import{a as u,c as d,f,r as p,s as m,t as h}from"./fixtures-d-jjpSKH.js";var g,_,v,y,b,x,S,C,w,T;e((()=>{n(),o(),i(),m(),c(),g=t(),{fn:_}=__STORYBOOK_MODULE_TEST__,v=[f,u,h],y={component:l,parameters:{layout:`fullscreen`},args:{task:u,columns:p,allTasks:v,projections:s(v,`Done`),tasksByNormalizedPath:r(v),onBack:_(),onTaskUpdate:_(),onDelete:_(),onAddSubIssue:_(),onSelectTask:_(),onAddLink:async()=>a.ok(u),onRemoveLink:async()=>a.ok(u)},decorators:[e=>(0,g.jsx)(`div`,{className:`h-screen min-h-[540px]`,children:(0,g.jsx)(e,{})})]},b={},x={},S={args:{task:d({title:`狭いviewportでも崩れずに折り返す非常に長いIssueタイトル`,body:``,labels:[],priority:void 0,due:void 0,children:[],links:[],extras:{}})}},C={args:{task:d({draft:!0})}},w={args:{task:d({parent:`tasks/missing-parent.md`,links:[`tasks/missing-link.md`],warnings:[{code:`parentCycle`,field:`parent`,message:`cycle`},{code:`invalidStatusUsedDefault`,field:`status`,message:`invalid`}]})}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  args: {
    task: makeDetailTask({
      title: "狭いviewportでも崩れずに折り返す非常に長いIssueタイトル",
      body: "",
      labels: [],
      priority: undefined,
      due: undefined,
      children: [],
      links: [],
      extras: {}
    })
  }
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  args: {
    task: makeDetailTask({
      draft: true
    })
  }
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  args: {
    task: makeDetailTask({
      parent: "tasks/missing-parent.md",
      links: ["tasks/missing-link.md"],
      warnings: [{
        code: "parentCycle",
        field: "parent",
        message: "cycle"
      }, {
        code: "invalidStatusUsedDefault",
        field: "status",
        message: "invalid"
      }]
    })
  }
}`,...w.parameters?.docs?.source}}},T=[`Default`,`AllProps`,`EdgeCases`,`Draft`,`BrokenAndWarnings`]}))();export{x as AllProps,w as BrokenAndWarnings,b as Default,C as Draft,S as EdgeCases,T as __namedExportsOrder,y as default};