import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,t as r}from"./ConfigFileTab-Dy61jevu.js";var i,a,o,s,c,l,u,d,f,p,m,h,g,_,v,y,b,x;e((()=>{n(),i=t(),{fn:a,userEvent:o,within:s}=__STORYBOOK_MODULE_TEST__,c={component:r,args:{onCopy:a(),onRegenerate:a(),onOpenExternal:a(),onRevealFolder:a()},parameters:{layout:`fullscreen`},decorators:[e=>(0,i.jsx)(`div`,{className:`min-h-screen bg-background px-8 py-6`,children:(0,i.jsx)(e,{})})]},l={},u={args:{initialFile:`guide`,toast:`GUIDE.md を再生成しました`}},d={args:{files:[]}},f={args:{status:`loading`}},p={args:{status:`error`,error:`config.json を読み込めませんでした`}},m={args:{initialFile:`guide`,isRegenerating:!0}},h={args:{toast:`config.json をコピーしました`}},g={args:{initialFile:`guide`}},_={args:{initialFile:`guide`},play:async({canvasElement:e})=>{await o.click(s(e).getByRole(`button`,{name:`再生成`}))}},v={args:{initialFile:`guide`},play:async({canvasElement:e})=>{await o.click(s(e).getByRole(`button`,{name:`コピー`}))}},y={args:{initialFile:`guide`},play:async({canvasElement:e})=>{await o.click(s(e).getByRole(`button`,{name:`外部エディタで開く`}))}},b={play:async({canvasElement:e})=>{await o.click(s(e).getByRole(`button`,{name:`フォルダを開く`}))}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    initialFile: "guide",
    toast: "GUIDE.md を再生成しました"
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    files: []
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    status: "loading"
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    status: "error",
    error: "config.json を読み込めませんでした"
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    initialFile: "guide",
    isRegenerating: true
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    toast: "config.json をコピーしました"
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    initialFile: "guide"
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    initialFile: "guide"
  },
  /**
   * 再生成ボタンを押した直後の状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "再生成"
    }));
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    initialFile: "guide"
  },
  /**
   * コピーボタンを押した直後の状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "コピー"
    }));
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    initialFile: "guide"
  },
  /**
   * 外部エディタで開くボタンを押した直後の状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "外部エディタで開く"
    }));
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  /**
   * フォルダを開くボタンを押した直後の状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "フォルダを開く"
    }));
  }
}`,...b.parameters?.docs?.source}}},x=[`Default`,`AllProps`,`EdgeCases`,`Loading`,`ErrorState`,`Regenerating`,`CopyToast`,`GuideSelected`,`Regenerate`,`CopyAction`,`OpenExternal`,`RevealFolder`]}))();export{u as AllProps,v as CopyAction,h as CopyToast,l as Default,d as EdgeCases,p as ErrorState,g as GuideSelected,f as Loading,y as OpenExternal,_ as Regenerate,m as Regenerating,b as RevealFolder,x as __namedExportsOrder,c as default};