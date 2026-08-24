import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,t as r}from"./FileNodeItem-BLiFXT5K.js";import{n as i,t as a}from"./task-D-P1wHzE.js";import{n as o,r as s,t as c}from"./taskFixtures-DNkWkUiU.js";var l,u,d,f,p,m,h,g,_,v;e((()=>{c(),i(),n(),l=t(),{fn:u}=__STORYBOOK_MODULE_TEST__,d=(e,t,n)=>a.fromPayload({id:e,title:t,status:`Todo`,labels:[],links:[],children:[],reverseLinks:[],body:``,filePath:n}),f={kind:`file`,name:`login.md`,task:d(`task-1`,`ログイン画面を改善`,o(`tasks/login.md`))},p={kind:`dir`,name:`features`,path:`features`,children:[f,{kind:`file`,name:`search.md`,task:d(`task-2`,`検索を追加`,`features/search.md`)}]},m={component:r,args:{node:f,depth:0,selectedTaskId:void 0,onSelect:u()},argTypes:{node:{control:`object`},depth:{control:{type:`number`,min:0}},selectedTaskId:{control:`text`},onSelect:{control:!1}},decorators:[e=>(0,l.jsx)(`ul`,{className:`w-64 border border-border bg-surface py-1`,children:(0,l.jsx)(e,{})})]},h={},g={args:{node:p,depth:1,selectedTaskId:s(`task-1`)}},_={args:{node:{kind:`file`,name:`a-very-long-task-file-name-that-needs-truncation.md`,task:d(`long`,`非常に長いタスクタイトルがツリーの横幅を超える状態`,`deep/path/a-very-long-task-file-name-that-needs-truncation.md`)},depth:6,selectedTaskId:s(`long`)}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    node: directoryNode,
    depth: 1,
    selectedTaskId: taskIdFixture("task-1")
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    node: {
      kind: "file",
      name: "a-very-long-task-file-name-that-needs-truncation.md",
      task: makeTask("long", "非常に長いタスクタイトルがツリーの横幅を超える状態", "deep/path/a-very-long-task-file-name-that-needs-truncation.md")
    },
    depth: 6,
    selectedTaskId: taskIdFixture("long")
  }
}`,..._.parameters?.docs?.source}}},v=[`Default`,`AllProps`,`EdgeCases`]}))();export{g as AllProps,h as Default,_ as EdgeCases,v as __namedExportsOrder,m as default};