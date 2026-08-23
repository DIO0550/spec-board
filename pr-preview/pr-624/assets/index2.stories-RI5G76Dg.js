import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,r}from"./mime-csdobhtb.js";import{n as i,t as a}from"./task-projection-C5xjQIaG.js";import{i as o,n as s,r as c,t as l}from"./BoardProviders-B3agfvrI.js";import{i as u,n as d,r as f,t as p}from"./test-fixtures-Ck8nEBqB.js";var m,h,g=e((()=>{i(),s(),m=t(),h=(e={})=>t=>{let n=e.tasks??[],r=e.allTasks??n;return(0,m.jsx)(l,{columns:[],projections:a.emptyMap,...e,tasks:n,allTasks:r,children:(0,m.jsx)(t,{})})};try{h.displayName=`withBoardProviders`,h.__docgenInfo={description:"Storybook の decorators 配列向けに `BoardProviders` で Story をラップする。\n既存 `withBoardCardProvider` / `withBoardColumnProvider` と同 tier の API で、\n未指定の prop は空配列 / no-op で埋まる（required な columns / tasks / allTasks も\nStory 側で省略可能にすることで、追加 Story でのボイラープレートと渡し忘れを防ぐ）。\n\n`allTasks` 省略時は `tasks` を流用する（`BoardProviders.state.test.tsx` の\n`mountProbe` と同型）。tasks だけ渡して allTasks 空のままだと\n`BoardCardProvider.byPath` や階層集計が壊れた状態の Story が作れてしまうため。",displayName:`withBoardProviders`,filePath:`/home/runner/work/spec-board/spec-board/src/features/board/components/BoardProviders/storybook/decorator.tsx`,methods:[],props:{columns:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/board/components/BoardProviders/index.tsx`,name:`TypeLiteral`}],description:`カラム定義の配列`,name:`columns`,required:!1,tags:{},type:{name:`readonly Column[]`}},tasks:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/board/components/BoardProviders/index.tsx`,name:`TypeLiteral`}],description:`表示中のタスク（絞り込み後の表示用集合）`,name:`tasks`,required:!1,tags:{},type:{name:`readonly Task[]`}},allTasks:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/board/components/BoardProviders/index.tsx`,name:`TypeLiteral`}],description:`階層カウント等の解決に使う全タスク集合。共通項として両 Provider に同値で渡される`,name:`allTasks`,required:!1,tags:{},type:{name:`readonly Task[]`}},tasksByNormalizedPath:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/board/components/BoardProviders/index.tsx`,name:`TypeLiteral`}],description:`正規化済み Task.filePath → Task の lookup Map`,name:`tasksByNormalizedPath`,required:!1,tags:{},type:{name:`ReadonlyMap<string, Task>`}},milestonesByName:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/board/components/BoardProviders/index.tsx`,name:`TypeLiteral`}],description:`name → マイルストーン定義の Map（カードバッジ用）`,name:`milestonesByName`,required:!1,tags:{},type:{name:`MilestonesByName`}},doneColumn:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/board/components/BoardProviders/index.tsx`,name:`TypeLiteral`}],description:`完了カラム名`,name:`doneColumn`,required:!1,tags:{},type:{name:`string`}},projections:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/board/components/BoardProviders/index.tsx`,name:`TypeLiteral`}],description:`filePath -> projection（BE 集計）。BoardCardProvider へそのまま渡す。`,name:`projections`,required:!1,tags:{},type:{name:`TaskProjectionMap`}},dndDisabled:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/board/components/BoardProviders/index.tsx`,name:`TypeLiteral`}],description:`カード / カラムの DnD を無効化するか。両 Provider に同値で配線される`,name:`dndDisabled`,required:!1,tags:{},type:{name:`boolean`}},onTaskDrop:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/board/components/BoardProviders/index.tsx`,name:`TypeLiteral`}],description:`タスク drop ハンドラ`,name:`onTaskDrop`,required:!1,tags:{},type:{name:`TaskDropHandler`}},onColumnReorder:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/board/components/BoardProviders/index.tsx`,name:`TypeLiteral`}],description:`カラム並び替えハンドラ`,name:`onColumnReorder`,required:!1,tags:{},type:{name:`ColumnReorderHandler`}}},tags:{param:`args 上書きしたい props（任意）`,returns:`Storybook の Decorator`}}}catch{}})),_,v,y,b,x,S,C,w,T,E,D,O,k,A,j,M,N,P,F;e((()=>{d(),g(),o(),r(),_=t(),{expect:v,fireEvent:y,waitFor:b,within:x}=__STORYBOOK_MODULE_TEST__,S=e=>(0,_.jsxs)(c,{children:[[...e].sort((e,t)=>e.order-t.order).map((e,t)=>(0,_.jsx)(c.Column,{name:e.name,color:e.color,order:t,onAddTask:()=>{},onTaskClick:()=>{},onRenameColumn:()=>{},onDeleteColumn:()=>{}},e.name)),(0,_.jsx)(c.AddColumn,{onAdd:()=>{}})]}),C={component:c,parameters:{layout:`fullscreen`},decorators:[h({columns:f,tasks:u,allTasks:u,doneColumn:`Done`,projections:p(u,`Done`)})]},w={render:()=>S(f)},T={decorators:[h({columns:f,tasks:[],allTasks:[],doneColumn:`Done`,projections:p([],`Done`)})],render:()=>S(f)},E=[{name:`Todo`,order:0}],D=u.filter(e=>e.status===`Todo`),O={decorators:[h({columns:E,tasks:D,allTasks:u,doneColumn:`Done`,projections:p(u,`Done`)})],render:()=>S(E)},k={render:()=>(0,_.jsx)(`div`,{"data-density":`compact`,className:`h-full`,children:S(f)})},A={...k},j={...T},M={render:()=>S(f)},N={render:()=>S(f),play:async({canvasElement:e})=>{let t=new DataTransfer;await y.dragStart(x(e).getAllByTestId(`task-card`)[0],{dataTransfer:t}),await v(e.querySelector(`[data-dragging='true']`)).not.toBeNull()}},P={render:()=>S(f),play:async({canvasElement:e})=>{let t=x(e),r=t.getAllByTestId(`task-card`)[0],i=t.getByTestId(`column-Done`),a=new DataTransfer;await y.dragStart(r,{dataTransfer:a}),a.setData(n,`tasks/task-1.md`),await y.dragOver(i,{dataTransfer:a,clientY:0}),await b(()=>{v(t.queryByTestId(`drop-placeholder`)).not.toBeNull()})}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  render: () => renderBoard(initialColumns)
}`,...w.parameters?.docs?.source}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  decorators: [withBoardProviders({
    columns: initialColumns,
    tasks: [],
    allTasks: [],
    doneColumn: "Done",
    projections: buildProjectionsFixture([], "Done")
  })],
  render: () => renderBoard(initialColumns)
}`,...T.parameters?.docs?.source}}},O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{
  decorators: [withBoardProviders({
    columns: singleTodoColumn,
    tasks: singleColumnTasks,
    allTasks: initialTasks,
    doneColumn: "Done",
    projections: buildProjectionsFixture(initialTasks, "Done")
  })],
  render: () => renderBoard(singleTodoColumn)
}`,...O.parameters?.docs?.source}}},k.parameters={...k.parameters,docs:{...k.parameters?.docs,source:{originalSource:`{
  render: () => <div data-density="compact" className="h-full">
      {renderBoard(initialColumns)}
    </div>
}`,...k.parameters?.docs?.source}}},A.parameters={...A.parameters,docs:{...A.parameters?.docs,source:{originalSource:`{
  ...Compact
}`,...A.parameters?.docs?.source}}},j.parameters={...j.parameters,docs:{...j.parameters?.docs,source:{originalSource:`{
  ...Empty
}`,...j.parameters?.docs?.source}}},M.parameters={...M.parameters,docs:{...M.parameters?.docs,source:{originalSource:`{
  render: () => renderBoard(initialColumns)
}`,...M.parameters?.docs?.source}}},N.parameters={...N.parameters,docs:{...N.parameters?.docs,source:{originalSource:`{
  render: () => renderBoard(initialColumns),
  play: async ({
    canvasElement
  }) => {
    const dataTransfer = new DataTransfer();
    await fireEvent.dragStart(within(canvasElement).getAllByTestId("task-card")[0], {
      dataTransfer
    });
    await expect(canvasElement.querySelector("[data-dragging='true']")).not.toBeNull();
  }
}`,...N.parameters?.docs?.source}}},P.parameters={...P.parameters,docs:{...P.parameters?.docs,source:{originalSource:`{
  render: () => renderBoard(initialColumns),
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    const card = canvas.getAllByTestId("task-card")[0];
    const doneColumn = canvas.getByTestId("column-Done");
    const dataTransfer = new DataTransfer();
    await fireEvent.dragStart(card, {
      dataTransfer
    });
    dataTransfer.setData(DRAG_MIME_TYPE, "tasks/task-1.md");
    await fireEvent.dragOver(doneColumn, {
      dataTransfer,
      clientY: 0
    });
    await waitFor(() => {
      expect(canvas.queryByTestId("drop-placeholder")).not.toBeNull();
    });
  }
}`,...P.parameters?.docs?.source}}},F=[`Default`,`Empty`,`SingleColumn`,`Compact`,`AllProps`,`EdgeCases`,`Print`,`Dragging`,`DropTarget`]}))();export{A as AllProps,k as Compact,w as Default,N as Dragging,P as DropTarget,j as EdgeCases,T as Empty,M as Print,O as SingleColumn,F as __namedExportsOrder,C as default};