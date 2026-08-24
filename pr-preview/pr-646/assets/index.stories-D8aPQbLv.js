import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,t as r}from"./CalendarView-C-ggPocj.js";import{n as i,t as a}from"./task-Ci6wIFAY.js";var o,s,c,l,u,d,f,p,m,h,g,_,v,y,b,x,S,C,w,T,E;e((()=>{i(),n(),o=t(),{fn:s,userEvent:c,within:l}=__STORYBOOK_MODULE_TEST__,u=`2026-08-23`,d=e=>String(e).padStart(2,`0`),f=e=>{let[t,n,r]=u.split(`-`).map(Number),i=new Date(t,n-1,r,12);return i.setDate(i.getDate()+e),[i.getFullYear(),d(i.getMonth()+1),d(i.getDate())].join(`-`)},p=e=>a.fromPayload({id:e.id,title:e.title,status:e.status??`Todo`,priority:e.priority,milestone:e.milestone,due:e.due,labels:e.labels??[],links:[],children:[],reverseLinks:[],body:``,filePath:e.filePath??`tasks/${e.id}.md`}),m=[p({id:`today-review`,title:`カレンダー表示をレビュー`,status:`In Review`,priority:`High`,due:f(0),labels:[`calendar`,`design`]}),p({id:`overdue`,title:`期限超過タスクの警告色を調整`,status:`In Progress`,priority:`High`,due:f(-4),labels:[`bug`]}),p({id:`done`,title:`月グリッドの基礎実装`,status:`Done`,due:f(-2),labels:[`frontend`]}),p({id:`milestone`,title:`v0.3 リリース`,status:`Todo`,priority:`High`,milestone:`v0.3`,due:f(8),labels:[`milestone`]}),p({id:`upcoming`,title:`週表示の操作確認`,status:`Todo`,priority:`Medium`,due:f(3)}),p({id:`today-2`,title:`サイドバーの予定を確認`,status:`Todo`,due:f(0)}),p({id:`today-3`,title:`ステータスfilterを確認`,status:`Backlog`,priority:`Low`,due:f(0)}),p({id:`today-4`,title:`overflow件数を確認`,status:`In Progress`,due:f(0)}),p({id:`undated`,title:`期限を決める必要があるタスク`,status:`Backlog`,due:void 0})],h={component:r,args:{tasks:m,today:u,columns:[{name:`Backlog`,order:0},{name:`Todo`,order:1},{name:`In Progress`,order:2},{name:`In Review`,order:3},{name:`Done`,order:4}],doneColumn:`Done`,onTaskClick:s(),onAddTask:s()},argTypes:{tasks:{control:`object`},today:{control:!1},onTaskClick:{control:!1},onAddTask:{control:!1}},parameters:{layout:`fullscreen`},decorators:[e=>(0,o.jsx)(`div`,{className:`h-screen min-h-[720px]`,children:(0,o.jsx)(e,{})})]},g={},_={args:{tasks:m,onTaskClick:s(),onAddTask:s()}},v={args:{tasks:[...m,p({id:`long-title`,title:`非常に長いタスクタイトルがカレンダーセルとサイドバーの横幅を超える状態を確認する`,status:`Unknown Status`,due:f(0)}),p({id:`invalid-due`,title:`不正な期限文字列`,due:`not-a-date`})]}},y={play:async({canvasElement:e})=>{let[t]=l(e).getAllByRole(`button`,{name:`カレンダー表示をレビュー`});await c.click(t)}},b={args:{tasks:[]}},x={play:async({canvasElement:e})=>{await c.click(l(e).getByRole(`button`,{name:`週`}))}},S={...y,name:`Detail Open`},C=[{name:`未着手`,order:0,color:`#1a2b3c`},{name:`進行中`,order:1},{name:`レビュー中`,order:2,color:`#c2410c`},{name:`完了`,order:3,color:`#15803d`}],w=m.map((e,t)=>p({id:e.id,title:e.title,status:C[t%C.length].name,priority:e.priority,milestone:e.milestone,due:e.due,labels:[...e.labels],filePath:e.filePath})),T={args:{tasks:w,columns:C,doneColumn:`完了`,onTaskClick:s(),onAddTask:s()}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: designTasks,
    onTaskClick: fn(),
    onAddTask: fn()
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
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
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    const [taskButton] = canvas.getAllByRole("button", {
      name: "カレンダー表示をレビュー"
    });
    await userEvent.click(taskButton);
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: []
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "週"
    }));
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  ...CompactDetail,
  name: "Detail Open"
}`,...S.parameters?.docs?.source}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: japaneseTasks,
    columns: japaneseColumns,
    doneColumn: "完了",
    onTaskClick: fn(),
    onAddTask: fn()
  }
}`,...T.parameters?.docs?.source}}},E=[`Default`,`AllProps`,`EdgeCases`,`CompactDetail`,`Empty`,`Week`,`DetailOpen`,`JapaneseColumns`]}))();export{_ as AllProps,y as CompactDetail,g as Default,S as DetailOpen,v as EdgeCases,b as Empty,T as JapaneseColumns,x as Week,E as __namedExportsOrder,h as default};