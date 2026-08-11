import{n as e}from"./chunk-BneVvdWh.js";import{r as t,t as n}from"./label-definition-DWCXWiuV.js";import{n as r,t as i}from"./LabelsField-KQ5Wg4wU.js";var a,o,s,c,l,u,d;e((()=>{t(),r(),{fn:a}=__STORYBOOK_MODULE_TEST__,o={component:i,args:{label:`ラベル`,onChange:a(),disabled:!1,"data-testid":`story-labels-field`}},s=[n.fromWire({name:`bug`,color:`#e11d48`}),n.fromWire({name:`feature`,color:`#16a34a`}),n.fromWire({name:`docs`})],c={args:{value:[`bug`],suggestions:s}},l={args:{value:[],suggestions:s}},u={args:{value:[],suggestions:[]}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    value: ["bug"],
    suggestions: SUGGESTIONS
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    value: [],
    suggestions: SUGGESTIONS
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    value: [],
    suggestions: []
  }
}`,...u.parameters?.docs?.source}}},d=[`WithSelection`,`Empty`,`NoSuggestions`]}))();export{l as Empty,u as NoSuggestions,c as WithSelection,d as __namedExportsOrder,o as default};