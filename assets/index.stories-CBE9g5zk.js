import{n as e}from"./chunk-BneVvdWh.js";import{n as t,s as n,t as r}from"./TaskFormTitle-b1ahe6IU.js";var i,a,o,s,c,l;e((()=>{n(),t(),i={component:r,args:{value:`ログイン画面のバグ修正`,disabled:!1,onChange:()=>{}}},a={},o={args:{value:``,error:{code:`EMPTY`}}},s={args:{value:`a`.repeat(201),error:{code:`TOO_LONG`,max:200,actual:201}}},c={args:{value:`a<b>c`,error:{code:`FORBIDDEN_CHAR`,chars:[`<`,`>`]}}},a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{}`,...a.parameters?.docs?.source}}},o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    value: "",
    error: {
      code: "EMPTY"
    }
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    value: "a".repeat(TITLE_MAX_LENGTH + 1),
    error: {
      code: "TOO_LONG",
      max: TITLE_MAX_LENGTH,
      actual: TITLE_MAX_LENGTH + 1
    }
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    value: "a<b>c",
    error: {
      code: "FORBIDDEN_CHAR",
      chars: ["<", ">"]
    }
  }
}`,...c.parameters?.docs?.source}}},l=[`Default`,`WithEmptyError`,`WithTooLongError`,`WithForbiddenCharError`]}))();export{a as Default,o as WithEmptyError,c as WithForbiddenCharError,s as WithTooLongError,l as __namedExportsOrder,i as default};