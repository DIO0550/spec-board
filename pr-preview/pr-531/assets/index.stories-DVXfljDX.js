import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./DetailBody-BdMRyyQX.js";import{a as r,c as i,s as a}from"./fixtures-d-jjpSKH.js";var o,s,c,l,u,d,f;e((()=>{a(),t(),{fn:o}=__STORYBOOK_MODULE_TEST__,s={component:n,args:{task:r,subIssueCounts:{done:1,total:2},onTitleConfirm:o(),onBodyConfirm:o()}},c={},l={},u={args:{task:i({title:`狭い画面でも自然に折り返す非常に長いIssueタイトルと空の本文`,body:``,due:void 0,children:[],extras:{}}),subIssueCounts:{done:0,total:0}}},d={args:{task:i({warnings:[{code:`parentCycle`,field:`parent`,message:`cycle`},{code:`invalidStatusUsedDefault`,field:`status`,message:`invalid`}]})}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    task: makeDetailTask({
      title: "狭い画面でも自然に折り返す非常に長いIssueタイトルと空の本文",
      body: "",
      due: undefined,
      children: [],
      extras: {}
    }),
    subIssueCounts: {
      done: 0,
      total: 0
    }
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    task: makeDetailTask({
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
}`,...d.parameters?.docs?.source}}},f=[`Default`,`AllProps`,`EdgeCases`,`Warnings`]}))();export{l as AllProps,c as Default,u as EdgeCases,d as Warnings,f as __namedExportsOrder,s as default};