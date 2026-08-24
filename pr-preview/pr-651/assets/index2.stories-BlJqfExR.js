import{n as e}from"./chunk-BneVvdWh.js";import{i as t,n}from"./test-fixtures-B9hSMIvn.js";import{n as r,t as i}from"./SubIssueSection-ll6ewQXN.js";var a,o,s,c,l,u,d,f,p,m,h;e((()=>{n(),r(),a=t[0],o=t.filter(e=>e.hierarchy.parentFilePath===a.filePath),s={component:i,args:{parentTask:a,childTasks:[],subIssueCounts:{done:0,total:0},isDone:()=>!1,onAddSubIssue:()=>{}}},c={args:{childTasks:[],subIssueCounts:{done:0,total:0}}},l={args:{childTasks:o,subIssueCounts:{done:0,total:o.length}}},u={args:{childTasks:o,subIssueCounts:{done:0,total:o.length},onChildClick:()=>{}}},d={args:{childTasks:o,subIssueCounts:{done:2,total:o.length+2}}},f={...l},p={...d},m={...c},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    childTasks: [],
    subIssueCounts: {
      done: 0,
      total: 0
    }
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    childTasks,
    subIssueCounts: {
      done: 0,
      total: childTasks.length
    }
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    childTasks,
    subIssueCounts: {
      done: 0,
      total: childTasks.length
    },
    onChildClick: () => {}
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    childTasks,
    // 直下子より子孫の方が多いケース（孫 2 件が完了済み）。
    subIssueCounts: {
      done: 2,
      total: childTasks.length + 2
    }
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  ...WithChildren
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  ...WithDescendantsBeyondDirectChildren
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  ...Empty
}`,...m.parameters?.docs?.source}}},h=[`Empty`,`WithChildren`,`Clickable`,`WithDescendantsBeyondDirectChildren`,`Default`,`AllProps`,`EdgeCases`]}))();export{p as AllProps,u as Clickable,f as Default,m as EdgeCases,c as Empty,l as WithChildren,d as WithDescendantsBeyondDirectChildren,h as __namedExportsOrder,s as default};