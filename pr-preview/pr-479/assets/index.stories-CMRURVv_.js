import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./task-CZP_nvOA.js";import{n as r,t as i}from"./SubIssueProgress-1kkAQEHC.js";var a,o,s,c,l,u,d,f;e((()=>{t(),r(),a=(e,t,r)=>n.fromPayload({id:e,title:r,status:t,labels:[],parent:`tasks/parent.md`,links:[],children:[],reverseLinks:[],body:``,filePath:`tasks/${e}.md`}),o=[a(`c1`,`Done`,`完了済み 1`),a(`c2`,`Done`,`完了済み 2`),a(`c3`,`Todo`,`未完了 1`),a(`c4`,`Todo`,`未完了 2`)],s={component:i,args:{childTasks:[],done:0,total:0,doneColumn:`Done`}},c={args:{childTasks:[],done:0,total:0}},l={args:{childTasks:o,done:2,total:4}},u={args:{childTasks:[a(`c1`,`Done`,`完了 1`),a(`c2`,`Done`,`完了 2`),a(`c3`,`Done`,`完了 3`)],done:3,total:3}},d={args:{childTasks:o,done:3,total:7}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    childTasks: [],
    done: 0,
    total: 0
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    childTasks: directChildren,
    done: 2,
    total: 4
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    childTasks: [makeChild("c1", "Done", "完了 1"), makeChild("c2", "Done", "完了 2"), makeChild("c3", "Done", "完了 3")],
    done: 3,
    total: 3
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    childTasks: directChildren,
    done: 3,
    total: 7
  }
}`,...d.parameters?.docs?.source}}},f=[`Empty`,`InProgress`,`AllDone`,`WithDescendantsBeyondDirectChildren`]}))();export{u as AllDone,c as Empty,l as InProgress,d as WithDescendantsBeyondDirectChildren,f as __namedExportsOrder,s as default};