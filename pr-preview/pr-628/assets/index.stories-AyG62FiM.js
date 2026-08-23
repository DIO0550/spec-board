import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./StatusField-D4ztv3u6.js";var r,i,a,o,s,c,l,u,d,f,p,m;e((()=>{t(),{fn:r,userEvent:i,within:a}=__STORYBOOK_MODULE_TEST__,o={component:n,args:{onChange:r(),disabled:!1}},s=[{name:`Todo`,order:0,color:`#3b82f6`},{name:`In Progress`,order:1,color:`#f59e0b`},{name:`Done`,order:2,color:`#16a34a`}],c={args:{columns:s,value:`Todo`}},l={args:{columns:s,value:``}},u={args:{columns:s,value:`Todo`,disabled:!0}},d={...u},f={...l},p={...c,play:async({canvasElement:e})=>{await i.click(a(e).getByTestId(`status-field`))}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    columns: COLUMNS,
    value: "Todo"
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    columns: COLUMNS,
    value: ""
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    columns: COLUMNS,
    value: "Todo",
    disabled: true
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  ...Disabled
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  ...Unselected
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  ...Default,
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByTestId("status-field"));
  }
}`,...p.parameters?.docs?.source}}},m=[`Default`,`Unselected`,`Disabled`,`AllProps`,`EdgeCases`,`Open`]}))();export{d as AllProps,c as Default,u as Disabled,f as EdgeCases,p as Open,l as Unselected,m as __namedExportsOrder,o as default};