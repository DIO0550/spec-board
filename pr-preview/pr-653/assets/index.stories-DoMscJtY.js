import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./task-D-P1wHzE.js";import{n as r,t as i}from"./CycleWarningBanner-kCCVUyU2.js";var a,o,s,c,l,u,d,f;e((()=>{t(),r(),a={id:`task-1`,title:`サンプル`,status:`Todo`,labels:[],links:[],children:[],reverseLinks:[],body:``,filePath:`tasks/sample.md`,extras:{},warnings:[]},o={title:`features/detail/CycleWarningBanner`,component:i},s={args:{task:n.fromPayload({...a,warnings:[{code:`parentCycle`,field:`parent`,message:`parent chain forms a cycle`}]})}},c={args:{task:n.fromPayload(a)}},l={args:{task:n.fromPayload({...a,warnings:[{code:`parentCycle`,field:`parent`,message:`parent chain forms a cycle`},{code:`parentNotFound`,field:`parent`,message:`parent task was not found`}]})}},u={...l},d={...c},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    task: Task.fromPayload({
      ...basePayload,
      warnings: [{
        code: "parentCycle",
        field: "parent",
        message: "parent chain forms a cycle"
      }]
    })
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    task: Task.fromPayload(basePayload)
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    task: Task.fromPayload({
      ...basePayload,
      warnings: [{
        code: "parentCycle",
        field: "parent",
        message: "parent chain forms a cycle"
      }, {
        code: "parentNotFound",
        field: "parent",
        message: "parent task was not found"
      }]
    })
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  ...MultipleWarnings
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  ...NoWarning
}`,...d.parameters?.docs?.source}}},f=[`Default`,`NoWarning`,`MultipleWarnings`,`AllProps`,`EdgeCases`]}))();export{u as AllProps,s as Default,d as EdgeCases,l as MultipleWarnings,c as NoWarning,f as __namedExportsOrder,o as default};