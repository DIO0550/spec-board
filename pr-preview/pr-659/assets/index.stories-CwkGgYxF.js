import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./SubIssueProgress-Bywdg2OZ.js";var r,i,a,o,s,c,l,u,d,f,p;e((()=>{t(),r=(e,t,n)=>({key:e,label:t,isDone:n}),i=[r(`c1`,`完了済み 1`,!0),r(`c2`,`完了済み 2`,!0),r(`c3`,`未完了 1`,!1),r(`c4`,`未完了 2`,!1)],a={component:n,args:{childRows:[],counts:{done:0,total:0}}},o={args:{childRows:[],counts:{done:0,total:0}}},s={args:{childRows:i,counts:{done:2,total:4}}},c={args:{childRows:[r(`c1`,`完了 1`,!0),r(`c2`,`完了 2`,!0),r(`c3`,`完了 3`,!0)],counts:{done:3,total:3}}},l={args:{childRows:i,counts:{done:3,total:7}}},u={...s},d={...l},f={...o},o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    childRows: [],
    counts: {
      done: 0,
      total: 0
    }
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    childRows: directChildRows,
    counts: {
      done: 2,
      total: 4
    }
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    childRows: [makeRow("c1", "完了 1", true), makeRow("c2", "完了 2", true), makeRow("c3", "完了 3", true)],
    counts: {
      done: 3,
      total: 3
    }
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    childRows: directChildRows,
    counts: {
      done: 3,
      total: 7
    }
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  ...InProgress
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  ...WithDescendantsBeyondDirectChildren
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  ...Empty
}`,...f.parameters?.docs?.source}}},p=[`Empty`,`InProgress`,`AllDone`,`WithDescendantsBeyondDirectChildren`,`Default`,`AllProps`,`EdgeCases`]}))();export{c as AllDone,d as AllProps,u as Default,f as EdgeCases,o as Empty,s as InProgress,l as WithDescendantsBeyondDirectChildren,p as __namedExportsOrder,a as default};