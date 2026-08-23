import{n as e}from"./chunk-BneVvdWh.js";import{r as t,t as n}from"./label-definition-DIEQCeLS.js";import{n as r,t as i}from"./LabelsField-Byv_L1A5.js";var a,o,s,c,l,u,d,f,p,m,h,g,_;e((()=>{t(),r(),{fn:a,userEvent:o,within:s}=__STORYBOOK_MODULE_TEST__,c={component:i,args:{label:`ラベル`,onChange:a(),disabled:!1,"data-testid":`story-labels-field`}},l=[n.fromWire({name:`bug`,color:`#e11d48`}),n.fromWire({name:`feature`,color:`#16a34a`}),n.fromWire({name:`docs`})],u={args:{value:[`bug`],suggestions:l}},d={args:{value:[],suggestions:l}},f={args:{value:[],suggestions:[]}},p={...d},m={...u},h={...f},g={...u,play:async({canvasElement:e})=>{await o.click(s(e).getByTestId(`story-labels-field`))}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    value: ["bug"],
    suggestions: SUGGESTIONS
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    value: [],
    suggestions: SUGGESTIONS
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    value: [],
    suggestions: []
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  ...Empty
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  ...WithSelection
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  ...NoSuggestions
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  ...WithSelection,
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByTestId("story-labels-field"));
  }
}`,...g.parameters?.docs?.source}}},_=[`WithSelection`,`Empty`,`NoSuggestions`,`Default`,`AllProps`,`EdgeCases`,`Open`]}))();export{m as AllProps,p as Default,h as EdgeCases,d as Empty,f as NoSuggestions,g as Open,u as WithSelection,_ as __namedExportsOrder,c as default};