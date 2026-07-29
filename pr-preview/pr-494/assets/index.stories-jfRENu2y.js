import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./PopoverSelect-DzrC9HbW.js";var r,i,a,o,s,c,l,u,d;e((()=>{t(),{fn:r}=__STORYBOOK_MODULE_TEST__,i={component:n,args:{label:`ステータス`,onChange:r(),disabled:!1,"data-testid":`story-popover-select`}},a=[{value:`Todo`,label:`Todo`,swatchColor:`oklch(0.55 0.13 265)`},{value:`In Progress`,label:`In Progress`,swatchColor:`oklch(0.66 0.14 65)`},{value:`Done`,label:`Done`,swatchColor:`oklch(0.55 0.13 155)`}],o=[{value:``,label:`なし`},{value:`High`,label:`High`,badgeClassName:`bg-red-100 text-red-800`},{value:`Medium`,label:`Medium`,badgeClassName:`bg-yellow-100 text-yellow-800`},{value:`Low`,label:`Low`,badgeClassName:`bg-blue-100 text-blue-800`}],s={args:{label:`ステータス`,required:!0,options:a,value:`Todo`}},c={args:{label:`優先度`,options:o,value:`High`}},l={args:{label:`優先度`,options:o,value:``}},u={args:{label:`ステータス`,options:a,value:`Done`,disabled:!0}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    label: "ステータス",
    required: true,
    options: STATUS_OPTIONS,
    value: "Todo"
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    label: "優先度",
    options: PRIORITY_OPTIONS,
    value: "High"
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    label: "優先度",
    options: PRIORITY_OPTIONS,
    value: ""
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    label: "ステータス",
    options: STATUS_OPTIONS,
    value: "Done",
    disabled: true
  }
}`,...u.parameters?.docs?.source}}},d=[`Status`,`Priority`,`Empty`,`Disabled`]}))();export{u as Disabled,l as Empty,c as Priority,s as Status,d as __namedExportsOrder,i as default};