import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,t as r}from"./FileTree-RswsFb-7.js";import{n as i,t as a}from"./task-4EKPGYnb.js";import{r as o,t as s}from"./taskFixtures-gXBuHYrC.js";var c,l,u,d,f,p,m,h,g;e((()=>{s(),i(),n(),c=t(),{fn:l}=__STORYBOOK_MODULE_TEST__,u=(e,t,n)=>a.fromPayload({id:e,title:t,status:`Todo`,labels:[],links:[],children:[],reverseLinks:[],body:``,filePath:n}),d={component:r,args:{tasks:[u(`task-1`,`ログイン画面を改善`,`features/auth/login.md`),u(`task-2`,`パスワード再設定`,`features/auth/password-reset.md`),u(`task-3`,`検索結果を整える`,`features/search/results.md`),u(`task-4`,`READMEを更新`,`README.md`)],selectedTaskId:o(`task-2`),onSelectTask:l()},argTypes:{tasks:{control:`object`},selectedTaskId:{control:`text`},onSelectTask:{control:!1}},decorators:[e=>(0,c.jsx)(`div`,{className:`w-64 border border-border bg-surface py-1`,children:(0,c.jsx)(e,{})})]},f={},p={},m={args:{tasks:[u(`long-task`,`非常に長いタスクタイトル`,`very/deep/nested/directory/a-very-long-task-file-name.md`)],selectedTaskId:o(`long-task`)}},h={args:{tasks:[],selectedTaskId:void 0}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: [makeTask("long-task", "非常に長いタスクタイトル", "very/deep/nested/directory/a-very-long-task-file-name.md")],
    selectedTaskId: taskIdFixture("long-task")
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: [],
    selectedTaskId: undefined
  }
}`,...h.parameters?.docs?.source}}},g=[`Default`,`AllProps`,`EdgeCases`,`Empty`]}))();export{p as AllProps,f as Default,m as EdgeCases,h as Empty,g as __namedExportsOrder,d as default};