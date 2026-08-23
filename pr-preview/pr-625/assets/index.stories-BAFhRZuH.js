import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,t as r}from"./RoadmapView-c3-BnSJ0.js";import{n as i,t as a}from"./task-bSS-Oy1E.js";var o,s,c,l,u,d,f,p,m,h,g,_,v,y,b,x,S;e((()=>{i(),n(),o=t(),{fn:s,userEvent:c,within:l}=__STORYBOOK_MODULE_TEST__,u=e=>a.fromPayload({id:`task`,title:`タスク`,status:`Todo`,labels:[],links:[],children:[],reverseLinks:[],body:``,filePath:`tasks/task.md`,extras:{start:`2026-04-20`},due:`2026-04-28`,...e}),d=[u({id:`auth`,title:`認証基盤の刷新`,status:`In Progress`,filePath:`tasks/auth.md`,children:[`tasks/login.md`,`tasks/session.md`],extras:{start:`2026-04-18`},due:`2026-05-06`}),u({id:`login`,title:`ログイン画面`,status:`Done`,filePath:`tasks/login.md`,parent:`tasks/auth.md`,extras:{start:`2026-04-20`},due:`2026-04-25`}),u({id:`session`,title:`セッション管理`,status:`In Progress`,filePath:`tasks/session.md`,parent:`tasks/auth.md`,extras:{start:`2026-04-24`},due:`2026-05-03`}),u({id:`mobile`,title:`モバイル体験の改善`,status:`Todo`,filePath:`tasks/mobile.md`,extras:{start:`2026-04-27`},due:`2026-05-15`})],f=[{name:`Todo`,order:0,color:`#64748b`},{name:`In Progress`,order:1,color:`#3b82f6`},{name:`Done`,order:2,color:`#22c55e`}],p=Array.from({length:24},(e,t)=>u({id:`scroll-epic-${t+1}`,title:`スクロール検証 Epic ${String(t+1).padStart(2,`0`)}`,status:f[t%f.length].name,filePath:`tasks/scroll-epic-${t+1}.md`,extras:{start:t===0?`2026-02-01`:`2026-04-01`},due:t===0?`2026-08-31`:`2026-05-31`})),m={component:r,args:{tasks:d,columns:f,doneColumn:`Done`,today:`2026-04-26`,onAddEpic:s(),onTaskClick:s()},parameters:{layout:`fullscreen`},decorators:[e=>(0,o.jsx)(`div`,{className:`h-screen min-h-[540px] min-w-[920px] bg-surface`,children:(0,o.jsx)(e,{})})]},h={},g={args:{defaultExpanded:!0}},_={args:{tasks:[u({id:`long`,title:`非常に長いEpic名でも固定ラベル領域と横スクロールを壊さないことを確認する`.repeat(2),status:`Unknown`,filePath:`tasks/long.md`,extras:{start:`2026-03-01`},due:`2026-06-30`}),u({id:`reverse`,title:`開始・終了の逆転を補正`,status:`Todo`,filePath:`tasks/reverse.md`,extras:{start:`2026-05-12`,end:`2026-05-01`}})]}},v={args:{defaultExpanded:!1}},y={args:{tasks:[]}},b={play:async({canvasElement:e})=>{await c.click(l(e).getByRole(`button`,{name:`週`}))}},x={args:{tasks:p},parameters:{viewport:{defaultViewport:`compact924`}},play:async({canvasElement:e})=>{let t=e.querySelector(`[data-roadmap-scroll]`);t!==null&&(t.scrollLeft=420,t.scrollTop=96,t.dispatchEvent(new Event(`scroll`,{bubbles:!0})))}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    defaultExpanded: true
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: [makeTask({
      id: "long",
      title: "非常に長いEpic名でも固定ラベル領域と横スクロールを壊さないことを確認する".repeat(2),
      status: "Unknown",
      filePath: "tasks/long.md",
      extras: {
        start: "2026-03-01"
      },
      due: "2026-06-30"
    }), makeTask({
      id: "reverse",
      title: "開始・終了の逆転を補正",
      status: "Todo",
      filePath: "tasks/reverse.md",
      extras: {
        start: "2026-05-12",
        end: "2026-05-01"
      }
    })]
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    defaultExpanded: false
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: []
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  /**
   * 週表示へ切り替えた状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "週"
    }));
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    tasks: scrollEpics
  },
  parameters: {
    viewport: {
      defaultViewport: "compact924"
    }
  },
  /**
   * 横スクロール時にヘッダーが固定されることを確認するためスクロールさせる。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    const scroll = canvasElement.querySelector<HTMLElement>("[data-roadmap-scroll]");
    if (scroll !== null) {
      scroll.scrollLeft = 420;
      scroll.scrollTop = 96;
      scroll.dispatchEvent(new Event("scroll", {
        bubbles: true
      }));
    }
  }
}`,...x.parameters?.docs?.source}}},S=[`Default`,`AllProps`,`EdgeCases`,`Collapsed`,`Empty`,`Week`,`ScrollSticky`]}))();export{g as AllProps,v as Collapsed,h as Default,_ as EdgeCases,y as Empty,x as ScrollSticky,b as Week,S as __namedExportsOrder,m as default};