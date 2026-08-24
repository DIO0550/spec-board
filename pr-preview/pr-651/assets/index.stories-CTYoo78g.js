import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,t as r}from"./AppSidebar-D9KxTb43.js";import{n as i,t as a}from"./task-D-P1wHzE.js";import{r as o,t as s}from"./taskFixtures-DNkWkUiU.js";var c,l,u,d,f,p,m,h,g;e((()=>{s(),i(),n(),c=t(),{fn:l}=__STORYBOOK_MODULE_TEST__,u=(e,t,n)=>a.fromPayload({id:e,title:t,status:`Todo`,labels:[],links:[],children:[],reverseLinks:[],body:``,filePath:n}),d={component:r,parameters:{layout:`fullscreen`},args:{projectName:`spec-board`,currentPath:`/workspace/spec-board`,recentProjects:[{path:`/workspace/spec-board`,name:`spec-board`},{path:`/workspace/design-system`,name:`design-system`}],tasks:[u(`task-1`,`ログイン画面を改善`,`features/auth/login.md`),u(`task-2`,`検索結果を整える`,`features/search/results.md`),u(`task-3`,`リリース手順を更新`,`docs/release.md`)],selectedTaskId:o(`task-2`),onOpenProject:l(),onOpenProjectPath:l(),onSelectTask:l()},argTypes:{projectName:{control:`text`},currentPath:{control:`text`},recentProjects:{control:`object`},tasks:{control:`object`},selectedTaskId:{control:`text`},onOpenProject:{control:!1},onOpenProjectPath:{control:!1},onSelectTask:{control:!1}},decorators:[e=>(0,c.jsxs)(`div`,{className:`flex h-screen bg-bg`,children:[(0,c.jsx)(e,{}),(0,c.jsx)(`main`,{className:`flex-1 p-6 text-sm text-muted`,children:`コンテンツ領域`})]})]},f={},p={},m={args:{projectName:`非常に長いプロジェクト名で省略表示を確認する`,currentPath:`/workspace/long-project`,recentProjects:[{path:`/workspace/a/very/deeply/nested/recent-project`,name:`非常に長い最近のプロジェクト名`}],tasks:[u(`long-task`,`非常に長いタスクタイトル`,`very/deep/nested/directory/a-very-long-task-file-name.md`)],selectedTaskId:o(`long-task`)}},h={args:{projectName:void 0,currentPath:void 0,recentProjects:[],tasks:[],selectedTaskId:void 0}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    projectName: "非常に長いプロジェクト名で省略表示を確認する",
    currentPath: "/workspace/long-project",
    recentProjects: [{
      path: "/workspace/a/very/deeply/nested/recent-project",
      name: "非常に長い最近のプロジェクト名"
    }],
    tasks: [makeTask("long-task", "非常に長いタスクタイトル", "very/deep/nested/directory/a-very-long-task-file-name.md")],
    selectedTaskId: taskIdFixture("long-task")
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    projectName: undefined,
    currentPath: undefined,
    recentProjects: [],
    tasks: [],
    selectedTaskId: undefined
  }
}`,...h.parameters?.docs?.source}}},g=[`Default`,`AllProps`,`EdgeCases`,`Empty`]}))();export{p as AllProps,f as Default,m as EdgeCases,h as Empty,g as __namedExportsOrder,d as default};