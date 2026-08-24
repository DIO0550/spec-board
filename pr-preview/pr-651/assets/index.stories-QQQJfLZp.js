import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./PopoverSelect-D5yvPhyz.js";var r,i,a,o,s,c,l,u,d,f,p,m,h,g,_,v,y,b;e((()=>{t(),{expect:r,fn:i,userEvent:a,within:o}=__STORYBOOK_MODULE_TEST__,s=i(),c={component:n,args:{label:`ステータス`,onChange:s,disabled:!1,"data-testid":`story-popover-select`}},l=[{value:`Todo`,label:`Todo`,swatchColor:`oklch(0.55 0.13 265)`},{value:`In Progress`,label:`In Progress`,swatchColor:`oklch(0.66 0.14 65)`},{value:`Done`,label:`Done`,swatchColor:`oklch(0.55 0.13 155)`}],u=[{value:``,label:`なし`},{value:`High`,label:`High`,badgeClassName:`bg-red-100 text-red-800`},{value:`Medium`,label:`Medium`,badgeClassName:`bg-yellow-100 text-yellow-800`},{value:`Low`,label:`Low`,badgeClassName:`bg-blue-100 text-blue-800`}],d={args:{label:`ステータス`,required:!0,options:l,value:`Todo`}},f={args:{label:`優先度`,options:u,value:`High`}},p={args:{label:`優先度`,options:u,value:``}},m={args:{label:`ステータス`,options:l,value:`Done`,disabled:!0}},h={...d},g={...f},_={...p},v={...d,play:async({canvasElement:e})=>{await a.click(o(e).getByTestId(`story-popover-select`))}},y={...d,play:async({canvasElement:e})=>{o(e).getByTestId(`story-popover-select`).focus(),await a.keyboard(`{ArrowDown}{ArrowDown}{Enter}`),await r(s).toHaveBeenCalledWith(`In Progress`)}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    label: "ステータス",
    required: true,
    options: STATUS_OPTIONS,
    value: "Todo"
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    label: "優先度",
    options: PRIORITY_OPTIONS,
    value: "High"
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    label: "優先度",
    options: PRIORITY_OPTIONS,
    value: ""
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    label: "ステータス",
    options: STATUS_OPTIONS,
    value: "Done",
    disabled: true
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  ...Status
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  ...Priority
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  ...Empty
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  ...Status,
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByTestId("story-popover-select"));
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  ...Status,
  play: async ({
    canvasElement
  }) => {
    const trigger = within(canvasElement).getByTestId("story-popover-select");
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    await expect(onChange).toHaveBeenCalledWith("In Progress");
  }
}`,...y.parameters?.docs?.source}}},b=[`Status`,`Priority`,`Empty`,`Disabled`,`Default`,`AllProps`,`EdgeCases`,`Open`,`Interaction`]}))();export{g as AllProps,h as Default,m as Disabled,_ as EdgeCases,p as Empty,y as Interaction,v as Open,f as Priority,d as Status,b as __namedExportsOrder,c as default};