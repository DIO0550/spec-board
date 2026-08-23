import{n as e}from"./chunk-BneVvdWh.js";import{a as t}from"./titleErrorMessage-C5r4njmu.js";import{n,t as r}from"./TaskFormSubIssues-Cu1RfFWN.js";var i,a,o,s,c,l,u,d,f,p;e((()=>{t(),n(),{fn:i}=__STORYBOOK_MODULE_TEST__,a={component:r,args:{value:`APIを実装
UIテストを追加`,disabled:!1,onChange:i()}},o={},s={},c={args:{value:Array.from({length:20},(e,t)=>`サブIssue ${t+1}`).join(`
`)}},l={args:{value:``}},u={},d={name:`Error`,args:{value:`正常\n${`a`.repeat(201)}`,error:{line:2,error:{code:`TOO_LONG`,max:200,actual:201}}}},f={args:{disabled:!0}},o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    value: Array.from({
      length: 20
    }, (_, index) => \`サブIssue \${index + 1}\`).join("\\n")
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    value: ""
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  name: "Error",
  args: {
    value: \`正常\\n\${"a".repeat(TITLE_MAX_LENGTH + 1)}\`,
    error: {
      line: 2,
      error: {
        code: "TOO_LONG",
        max: TITLE_MAX_LENGTH,
        actual: TITLE_MAX_LENGTH + 1
      }
    }
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    disabled: true
  }
}`,...f.parameters?.docs?.source}}},p=[`Default`,`AllProps`,`EdgeCases`,`Empty`,`Filled`,`ErrorState`,`Submitting`]}))();export{s as AllProps,o as Default,c as EdgeCases,l as Empty,d as ErrorState,u as Filled,f as Submitting,p as __namedExportsOrder,a as default};