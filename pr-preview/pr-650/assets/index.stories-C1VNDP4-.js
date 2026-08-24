import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,t as r}from"./AppSidebar-9SGP3BOU.js";import{n as i,t as a}from"./task-Ci6wIFAY.js";var o,s,c,l,u,d,f,p,m;e((()=>{i(),n(),o=t(),{fn:s}=__STORYBOOK_MODULE_TEST__,c=(e,t,n)=>a.fromPayload({id:e,title:t,status:`Todo`,labels:[],links:[],children:[],reverseLinks:[],body:``,filePath:n}),l={component:r,parameters:{layout:`fullscreen`},args:{projectName:`spec-board`,currentPath:`/workspace/spec-board`,recentProjects:[{path:`/workspace/spec-board`,name:`spec-board`},{path:`/workspace/design-system`,name:`design-system`}],tasks:[c(`task-1`,`ログイン画面を改善`,`features/auth/login.md`),c(`task-2`,`検索結果を整える`,`features/search/results.md`),c(`task-3`,`リリース手順を更新`,`docs/release.md`)],selectedTaskId:`task-2`,onOpenProject:s(),onOpenProjectPath:s(),onSelectTask:s()},argTypes:{projectName:{control:`text`},currentPath:{control:`text`},recentProjects:{control:`object`},tasks:{control:`object`},selectedTaskId:{control:`text`},onOpenProject:{control:!1},onOpenProjectPath:{control:!1},onSelectTask:{control:!1}},decorators:[e=>(0,o.jsxs)(`div`,{className:`flex h-screen bg-bg`,children:[(0,o.jsx)(e,{}),(0,o.jsx)(`main`,{className:`flex-1 p-6 text-sm text-muted`,children:`コンテンツ領域`})]})]},u={},d={},f={args:{projectName:`非常に長いプロジェクト名で省略表示を確認する`,currentPath:`/workspace/long-project`,recentProjects:[{path:`/workspace/a/very/deeply/nested/recent-project`,name:`非常に長い最近のプロジェクト名`}],tasks:[c(`long-task`,`非常に長いタスクタイトル`,`very/deep/nested/directory/a-very-long-task-file-name.md`)],selectedTaskId:`long-task`}},p={args:{projectName:void 0,currentPath:void 0,recentProjects:[],tasks:[],selectedTaskId:void 0}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    projectName: "非常に長いプロジェクト名で省略表示を確認する",
    currentPath: "/workspace/long-project",
    recentProjects: [{
      path: "/workspace/a/very/deeply/nested/recent-project",
      name: "非常に長い最近のプロジェクト名"
    }],
    tasks: [makeTask("long-task", "非常に長いタスクタイトル", "very/deep/nested/directory/a-very-long-task-file-name.md")],
    selectedTaskId: "long-task"
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    projectName: undefined,
    currentPath: undefined,
    recentProjects: [],
    tasks: [],
    selectedTaskId: undefined
  }
}`,...p.parameters?.docs?.source}}},m=[`Default`,`AllProps`,`EdgeCases`,`Empty`]}))();export{d as AllProps,u as Default,f as EdgeCases,p as Empty,m as __namedExportsOrder,l as default};