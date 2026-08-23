import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,t as r}from"./CalendarView-CcsKesGv.js";import{n as i,t as a}from"./task-bSS-Oy1E.js";var o,s,c,l,u,d,f,p,m,h,g,_,v,y,b,x,S,C,w,T;e((()=>{i(),n(),o=t(),{fn:s,userEvent:c,within:l}=__STORYBOOK_MODULE_TEST__,u=e=>String(e).padStart(2,`0`),d=e=>{let t=new Date;return t.setHours(12,0,0,0),t.setDate(t.getDate()+e),[t.getFullYear(),u(t.getMonth()+1),u(t.getDate())].join(`-`)},f=e=>a.fromPayload({id:e.id,title:e.title,status:e.status??`Todo`,priority:e.priority,milestone:e.milestone,due:e.due,labels:e.labels??[],links:[],children:[],reverseLinks:[],body:``,filePath:e.filePath??`tasks/${e.id}.md`}),p=[f({id:`today-review`,title:`カレンダー表示をレビュー`,status:`In Review`,priority:`High`,due:d(0),labels:[`calendar`,`design`]}),f({id:`overdue`,title:`期限超過タスクの警告色を調整`,status:`In Progress`,priority:`High`,due:d(-4),labels:[`bug`]}),f({id:`done`,title:`月グリッドの基礎実装`,status:`Done`,due:d(-2),labels:[`frontend`]}),f({id:`milestone`,title:`v0.3 リリース`,status:`Todo`,priority:`High`,milestone:`v0.3`,due:d(8),labels:[`milestone`]}),f({id:`upcoming`,title:`週表示の操作確認`,status:`Todo`,priority:`Medium`,due:d(3)}),f({id:`today-2`,title:`サイドバーの予定を確認`,status:`Todo`,due:d(0)}),f({id:`today-3`,title:`ステータスfilterを確認`,status:`Backlog`,priority:`Low`,due:d(0)}),f({id:`today-4`,title:`overflow件数を確認`,status:`In Progress`,due:d(0)}),f({id:`undated`,title:`期限を決める必要があるタスク`,status:`Backlog`,due:void 0})],m={component:r,args:{tasks:p,columns:[{name:`Backlog`,order:0},{name:`Todo`,order:1},{name:`In Progress`,order:2},{name:`In Review`,order:3},{name:`Done`,order:4}],doneColumn:`Done`,onTaskClick:s(),onAddTask:s()},argTypes:{tasks:{control:`object`},onTaskClick:{control:!1},onAddTask:{control:!1}},parameters:{layout:`fullscreen`},decorators:[e=>(0,o.jsx)(`div`,{className:`h-screen min-h-[720px]`,children:(0,o.jsx)(e,{})})]},h={},g={args:{tasks:p,onTaskClick:s(),onAddTask:s()}},_={args:{tasks:[...p,f({id:`long-title`,title:`非常に長いタスクタイトルがカレンダーセルとサイドバーの横幅を超える状態を確認する`,status:`Unknown Status`,due:d(0)}),f({id:`invalid-due`,title:`不正な期限文字列`,due:`not-a-date`})]}},v={play:async({canvasElement:e})=>{let[t]=l(e).getAllByRole(`button`,{name:`カレンダー表示をレビュー`});await c.click(t)}},y={args:{tasks:[]}},b={play:async({canvasElement:e})=>{await c.click(l(e).getByRole(`button`,{name:`週`}))}},x={...v,name:`Detail Open`},S=[{name:`未着手`,order:0,color:`#1a2b3c`},{name:`進行中`,order:1},{name:`レビュー中`,order:2,color:`#c2410c`},{name:`完了`,order:3,color:`#15803d`}],C=p.map((e,t)=>f({id:e.id,title:e.title,status:S[t%S.length].name,priority:e.priority,milestone:e.milestone,due:e.due,labels:[...e.labels],filePath:e.filePath})),w={args:{tasks:C,columns:S,doneColumn:`完了`,onTaskClick:s(),onAddTask:s()}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: designTasks,
    onTaskClick: fn(),
    onAddTask: fn()
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: [...designTasks, makeTask({
      id: "long-title",
      title: "非常に長いタスクタイトルがカレンダーセルとサイドバーの横幅を超える状態を確認する",
      status: "Unknown Status",
      due: dateFromToday(0)
    }), makeTask({
      id: "invalid-due",
      title: "不正な期限文字列",
      due: "not-a-date"
    })]
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    const [taskButton] = canvas.getAllByRole("button", {
      name: "カレンダー表示をレビュー"
    });
    await userEvent.click(taskButton);
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: []
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "週"
    }));
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  ...CompactDetail,
  name: "Detail Open"
}`,...x.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: japaneseTasks,
    columns: japaneseColumns,
    doneColumn: "完了",
    onTaskClick: fn(),
    onAddTask: fn()
  }
}`,...w.parameters?.docs?.source}}},T=[`Default`,`AllProps`,`EdgeCases`,`CompactDetail`,`Empty`,`Week`,`DetailOpen`,`JapaneseColumns`]}))();export{g as AllProps,v as CompactDetail,h as Default,x as DetailOpen,_ as EdgeCases,y as Empty,w as JapaneseColumns,b as Week,T as __namedExportsOrder,m as default};