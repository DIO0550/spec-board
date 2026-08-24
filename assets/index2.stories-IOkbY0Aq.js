import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{t as n}from"./useTheme-C8pGSKs_.js";import{t as r}from"./shell-CqoPOBDr.js";import{r as i,t as a}from"./label-definition-DIEQCeLS.js";import{n as o,t as s}from"./SettingsScreen-FGQ5T_wz.js";var c,l,u,d,f,p,m,h,g,_,v,y,b,x,S,C,w,T,E,D,O,k,A;e((()=>{i(),r(),o(),c=t(),{fn:l,userEvent:u,within:d}=__STORYBOOK_MODULE_TEST__,f=a.listFromWire([{name:`bug`,description:`バグ報告`,group:`type`,color:`#d55753`}]),p={labels:f,usageCounts:{bug:8},byName:a.byName(f),status:`loaded`,reload:l(async()=>{})},m={milestones:[],usageCounts:{},byName:new Map,status:`loaded`,reload:l(async()=>{})},h={isPending:!1,create:l(async()=>!0),update:l(async()=>!0),remove:l(async()=>null)},g={component:s,args:{labels:p,milestones:m,milestoneProjections:new Map,milestoneMutations:h,onLabelUsageClick:l(),onBack:l(),onStatusSave:l(async()=>!0),projectName:`payments-service`,projectPath:`/work/payments-service`,tasks:[],columns:[{name:`Todo`,order:0,color:`#4f6fc7`},{name:`Done`,order:1,color:`#3a9b67`}],doneColumn:`Done`},parameters:{layout:`fullscreen`},decorators:[e=>(0,c.jsx)(n,{children:(0,c.jsx)(`div`,{className:`h-screen min-h-[720px]`,children:(0,c.jsx)(e,{})})})]},_={},v={args:{initialTabId:`statuses`}},y={args:{initialTabId:`config`,labels:{...p,labels:[],usageCounts:{},byName:new Map}}},b={args:{initialTabId:`statuses`}},x={args:{initialTabId:`config`}},S=async e=>{await u.click(d(e).getByRole(`tab`,{name:/GUIDE\.md/}))},C={args:{initialTabId:`config`},play:async({canvasElement:e})=>S(e)},w={args:{initialTabId:`config`},play:async({canvasElement:e})=>{await S(e),await u.click(d(e).getByRole(`button`,{name:`再生成`}))}},T={args:{initialTabId:`config`},play:async({canvasElement:e})=>{await S(e),await u.click(d(e).getByRole(`button`,{name:`コピー`}))}},E={args:{initialTabId:`config`},play:async({canvasElement:e})=>{await S(e),await u.click(d(e).getByRole(`button`,{name:`外部エディタで開く`}))}},D={args:{initialTabId:`config`},play:async({canvasElement:e})=>{await u.click(d(e).getByRole(`button`,{name:`フォルダを開く`}))}},O={args:{initialTabId:`appearance`},play:async({canvasElement:e})=>{let t=d(e);await u.click(t.getByRole(`button`,{name:`ダーク`})),await u.click(t.getByRole(`button`,{name:`コンパクト`})),await u.click(t.getByRole(`button`,{name:/バイオレット/}))}},k={args:{initialTabId:`appearance`},play:async({canvasElement:e})=>{let t=d(e);await u.click(t.getByRole(`button`,{name:`ライト`})),await u.click(t.getByRole(`button`,{name:`標準`})),await u.click(t.getByRole(`button`,{name:/ローズ/}))}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    initialTabId: "statuses"
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    initialTabId: "config",
    labels: {
      ...labelsResource,
      labels: [],
      usageCounts: {},
      byName: new Map()
    }
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    initialTabId: "statuses"
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    initialTabId: "config"
  }
}`,...x.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  args: {
    initialTabId: "config"
  },
  /**
   * GUIDE.md を選択した状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => selectGuide(canvasElement)
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  args: {
    initialTabId: "config"
  },
  /**
   * GUIDE.md を選び、再生成ボタンを押した状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    await selectGuide(canvasElement);
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "再生成"
    }));
  }
}`,...w.parameters?.docs?.source}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  args: {
    initialTabId: "config"
  },
  /**
   * GUIDE.md を選び、コピーボタンを押した状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    await selectGuide(canvasElement);
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "コピー"
    }));
  }
}`,...T.parameters?.docs?.source}}},E.parameters={...E.parameters,docs:{...E.parameters?.docs,source:{originalSource:`{
  args: {
    initialTabId: "config"
  },
  /**
   * GUIDE.md を選び、外部エディタで開くボタンを押した状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    await selectGuide(canvasElement);
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "外部エディタで開く"
    }));
  }
}`,...E.parameters?.docs?.source}}},D.parameters={...D.parameters,docs:{...D.parameters?.docs,source:{originalSource:`{
  args: {
    initialTabId: "config"
  },
  /**
   * フォルダを開くボタンを押した状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "フォルダを開く"
    }));
  }
}`,...D.parameters?.docs?.source}}},O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{
  args: {
    initialTabId: "appearance"
  },
  /**
   * ダーク・コンパクト・バイオレットを選んだ外観設定を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", {
      name: "ダーク"
    }));
    await userEvent.click(canvas.getByRole("button", {
      name: "コンパクト"
    }));
    await userEvent.click(canvas.getByRole("button", {
      name: /バイオレット/
    }));
  }
}`,...O.parameters?.docs?.source}}},k.parameters={...k.parameters,docs:{...k.parameters?.docs,source:{originalSource:`{
  args: {
    initialTabId: "appearance"
  },
  /**
   * ライト・標準・ローズを選んだ外観設定を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", {
      name: "ライト"
    }));
    await userEvent.click(canvas.getByRole("button", {
      name: "標準"
    }));
    await userEvent.click(canvas.getByRole("button", {
      name: /ローズ/
    }));
  }
}`,...k.parameters?.docs?.source}}},A=[`Default`,`AllProps`,`EdgeCases`,`Status`,`ConfigFile`,`ConfigGuideSelected`,`ConfigRegenerate`,`ConfigCopy`,`ConfigOpenExternal`,`ConfigRevealFolder`,`AppearanceDarkCompact`,`AppearanceAccentFixed`]}))();export{v as AllProps,k as AppearanceAccentFixed,O as AppearanceDarkCompact,T as ConfigCopy,x as ConfigFile,C as ConfigGuideSelected,E as ConfigOpenExternal,w as ConfigRegenerate,D as ConfigRevealFolder,_ as Default,y as EdgeCases,b as Status,A as __namedExportsOrder,g as default};