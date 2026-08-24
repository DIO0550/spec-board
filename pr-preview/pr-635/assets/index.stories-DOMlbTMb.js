import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,t as r}from"./FileNodeItem-CLiX_wyc.js";import{n as i,t as a}from"./task-bSS-Oy1E.js";var o,s,c,l,u,d,f,p,m,h;e((()=>{i(),n(),o=t(),{fn:s}=__STORYBOOK_MODULE_TEST__,c=(e,t,n)=>a.fromPayload({id:e,title:t,status:`Todo`,labels:[],links:[],children:[],reverseLinks:[],body:``,filePath:n}),l={kind:`file`,name:`login.md`,task:c(`task-1`,`ログイン画面を改善`,`tasks/login.md`)},u={kind:`dir`,name:`features`,path:`features`,children:[l,{kind:`file`,name:`search.md`,task:c(`task-2`,`検索を追加`,`features/search.md`)}]},d={component:r,args:{node:l,depth:0,selectedTaskId:void 0,onSelect:s()},argTypes:{node:{control:`object`},depth:{control:{type:`number`,min:0}},selectedTaskId:{control:`text`},onSelect:{control:!1}},decorators:[e=>(0,o.jsx)(`ul`,{className:`w-64 border border-border bg-surface py-1`,children:(0,o.jsx)(e,{})})]},f={},p={args:{node:u,depth:1,selectedTaskId:`task-1`}},m={args:{node:{kind:`file`,name:`a-very-long-task-file-name-that-needs-truncation.md`,task:c(`long`,`非常に長いタスクタイトルがツリーの横幅を超える状態`,`deep/path/a-very-long-task-file-name-that-needs-truncation.md`)},depth:6,selectedTaskId:`long`}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    node: directoryNode,
    depth: 1,
    selectedTaskId: "task-1"
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    node: {
      kind: "file",
      name: "a-very-long-task-file-name-that-needs-truncation.md",
      task: makeTask("long", "非常に長いタスクタイトルがツリーの横幅を超える状態", "deep/path/a-very-long-task-file-name-that-needs-truncation.md")
    },
    depth: 6,
    selectedTaskId: "long"
  }
}`,...m.parameters?.docs?.source}}},h=[`Default`,`AllProps`,`EdgeCases`]}))();export{p as AllProps,f as Default,m as EdgeCases,h as __namedExportsOrder,d as default};