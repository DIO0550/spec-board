import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./result-7c-baUo1.js";import{n as r,t as i}from"./task-4EKPGYnb.js";import{n as a,t as o}from"./LinksSection-BfXvHNOG.js";var s,c,l,u,d,f,p,m,h,g,_,v,y,b,x,S,C,w;e((()=>{r(),t(),a(),{fn:s}=__STORYBOOK_MODULE_TEST__,c=e=>i.fromPayload({id:e.filePath??`id`,title:`サンプル`,status:`Todo`,labels:[],links:[],children:[],reverseLinks:[],body:``,filePath:`tasks/x.md`,...e}),l=c({id:`self`,title:`自タスク`,filePath:`tasks/self.md`}),u=c({id:`linked-a`,title:`リンク先 A`,filePath:`tasks/linked-a.md`}),d=c({id:`rev-a`,title:`リンク元 A`,filePath:`tasks/reverse-a.md`}),f=c({id:`c`,title:`候補タスク`,filePath:`tasks/candidate.md`}),p=async()=>n.ok(l),m=async()=>n.ok(l),h={component:o,parameters:{layout:`padded`},args:{task:l,allTasks:[l,f],parentFilePath:null,childrenFilePaths:[],onAddLink:p,onRemoveLink:m,onLinkClick:s()}},g={},_={args:{task:c({id:`self`,title:`自タスク`,filePath:`tasks/self.md`,links:[`tasks/linked-a.md`]}),allTasks:[l,u,f]}},v={args:{task:c({id:`self`,title:`自タスク`,filePath:`tasks/self.md`,reverseLinks:[`tasks/reverse-a.md`]}),allTasks:[l,d,f]}},y={args:{task:c({id:`self`,title:`自タスク`,filePath:`tasks/self.md`,links:[`tasks/linked-a.md`],reverseLinks:[`tasks/reverse-a.md`]}),allTasks:[l,u,d,f]}},b={args:{task:c({id:`self`,title:`自タスク`,filePath:`tasks/self.md`,links:[`tasks/linked-a.md`],reverseLinks:[`tasks/reverse-a.md`]}),allTasks:[l,u,d,f],onLinkClick:void 0}},x={..._},S={...y},C={...g},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    task: makeTask({
      id: "self",
      title: "自タスク",
      filePath: "tasks/self.md",
      links: ["tasks/linked-a.md"]
    }),
    allTasks: [self, linkedA, candidate]
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    task: makeTask({
      id: "self",
      title: "自タスク",
      filePath: "tasks/self.md",
      reverseLinks: ["tasks/reverse-a.md"]
    }),
    allTasks: [self, reverseA, candidate]
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    task: makeTask({
      id: "self",
      title: "自タスク",
      filePath: "tasks/self.md",
      links: ["tasks/linked-a.md"],
      reverseLinks: ["tasks/reverse-a.md"]
    }),
    allTasks: [self, linkedA, reverseA, candidate]
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    task: makeTask({
      id: "self",
      title: "自タスク",
      filePath: "tasks/self.md",
      links: ["tasks/linked-a.md"],
      reverseLinks: ["tasks/reverse-a.md"]
    }),
    allTasks: [self, linkedA, reverseA, candidate],
    onLinkClick: undefined
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  ...WithLinks
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  ...WithBothDirections
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  ...NoLinks
}`,...C.parameters?.docs?.source}}},w=[`NoLinks`,`WithLinks`,`WithReverseLinks`,`WithBothDirections`,`NavigationDisabled`,`Default`,`AllProps`,`EdgeCases`]}))();export{S as AllProps,x as Default,C as EdgeCases,b as NavigationDisabled,g as NoLinks,y as WithBothDirections,_ as WithLinks,v as WithReverseLinks,w as __namedExportsOrder,h as default};