import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,t as r}from"./task-path-lookup-B2fouxYD.js";import{i,n as a,r as o,t as s}from"./PropertiesSidebar-DVB3_Fji.js";import{a as c,c as l,i as u,l as d,n as f,o as p,r as m,s as h}from"./fixtures-CG0R8PH2.js";import{n as g,t as _}from"./decorator-BX5hQgrE.js";var v,y,b,x=e((()=>{p(),i(),v=t(),{fn:y}=__STORYBOOK_MODULE_TEST__,b=(e={})=>t=>(0,v.jsx)(o,{task:c,onDelete:y(),...e,children:(0,v.jsx)(t,{})});try{b.displayName=`withDeleteFlowProvider`,b.__docgenInfo={description:"`DeleteFlowProvider` で Story をラップする Decorator を返す。",displayName:`withDeleteFlowProvider`,filePath:`/home/runner/work/spec-board/spec-board/src/features/detail/providers/DeleteFlowProvider/storybook/decorator.tsx`,methods:[],props:{task:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/detail/providers/DeleteFlowProvider/index.tsx`,name:`TypeLiteral`}],description:`削除対象タスク（id と子タスクの有無を使う）`,name:`task`,required:!1,tags:{},type:{name:`Task`}},onDelete:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/detail/providers/DeleteFlowProvider/index.tsx`,name:`TypeLiteral`}],description:`削除実行 callback（App 側の invoke ラッパ）`,name:`onDelete`,required:!1,tags:{},type:{name:`DeleteTaskHandler`}}},tags:{param:`args 上書きしたい props（任意）`,returns:`Storybook の Decorator`}}}catch{}})),S,C,w,T,E,D,O,k,A,j,M;e((()=>{n(),x(),_(),p(),a(),S=t(),{fireEvent:C,fn:w,within:T}=__STORYBOOK_MODULE_TEST__,E={component:s,parameters:{layout:`padded`},decorators:[e=>(0,S.jsx)(`div`,{className:`w-[340px] border border-border bg-surface`,children:(0,S.jsx)(e,{})}),b({task:c}),g({task:c,columns:m,allTasks:f,projections:u,tasksByNormalizedPath:r.fromTasks(f),onAddSubIssue:w(),onSelectTask:w(),onAddLink:l,onRemoveLink:d})],args:{}},D={},O={args:{onArchive:w()}},k=h({parent:`tasks/missing-parent.md`,links:[`tasks/missing-link.md`],extras:{}}),A={decorators:[b({task:k}),g({task:k,columns:m,allTasks:[k],projections:u,tasksByNormalizedPath:r.fromTasks([k]),onSelectTask:w(),onAddLink:l})]},j={play:async({canvasElement:e})=>{await C.click(T(e).getByTestId(`detail-delete-button`))}},D.parameters={...D.parameters,docs:{...D.parameters?.docs,source:{originalSource:`{}`,...D.parameters?.docs?.source}}},O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{
  args: {
    onArchive: fn()
  }
}`,...O.parameters?.docs?.source}}},A.parameters={...A.parameters,docs:{...A.parameters?.docs,source:{originalSource:`{
  decorators: [withDeleteFlowProvider({
    task: brokenTask
  }), withDetailProvider({
    task: brokenTask,
    columns: detailColumns,
    allTasks: [brokenTask],
    projections: detailProjections,
    tasksByNormalizedPath: TaskPathLookup.fromTasks([brokenTask]),
    onSelectTask: fn(),
    onAddLink: noopAddLink
  })]
}`,...A.parameters?.docs?.source}}},j.parameters={...j.parameters,docs:{...j.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    await fireEvent.click(within(canvasElement).getByTestId("detail-delete-button"));
  }
}`,...j.parameters?.docs?.source}}},M=[`Default`,`AllProps`,`EdgeCases`,`DeleteConfirmation`]}))();export{O as AllProps,D as Default,j as DeleteConfirmation,A as EdgeCases,M as __namedExportsOrder,E as default};