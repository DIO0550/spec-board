import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,t as r}from"./ConfigFileTab-DpTDfPGa.js";var i,a,o,s,c,l,u,d,f,p,m,h,g,_,v;e((()=>{n(),i=t(),{fn:a,userEvent:o,within:s}=__STORYBOOK_MODULE_TEST__,c={component:r,args:{onCopy:a(),onRegenerate:a(),onOpenExternal:a(),onRevealFolder:a()},parameters:{layout:`fullscreen`},decorators:[e=>(0,i.jsx)(`div`,{className:`min-h-screen bg-background px-8 py-6`,children:(0,i.jsx)(e,{})})]},l={},u={args:{initialFile:`guide`,toast:`GUIDE.md を再生成しました`}},d={args:{files:[]}},f={args:{toast:`config.json をコピーしました`}},p={args:{initialFile:`guide`}},m={args:{initialFile:`guide`},play:async({canvasElement:e})=>{await o.click(s(e).getByRole(`button`,{name:`再生成`}))}},h={args:{initialFile:`guide`},play:async({canvasElement:e})=>{await o.click(s(e).getByRole(`button`,{name:`コピー`}))}},g={args:{initialFile:`guide`},play:async({canvasElement:e})=>{await o.click(s(e).getByRole(`button`,{name:`外部エディタで開く`}))}},_={play:async({canvasElement:e})=>{await o.click(s(e).getByRole(`button`,{name:`フォルダを開く`}))}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
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
    toast: "config.json をコピーしました"
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    initialFile: "guide"
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    initialFile: "guide"
  },
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "再生成"
    }));
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    initialFile: "guide"
  },
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "コピー"
    }));
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    initialFile: "guide"
  },
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "外部エディタで開く"
    }));
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "フォルダを開く"
    }));
  }
}`,..._.parameters?.docs?.source}}},v=[`Default`,`AllProps`,`EdgeCases`,`CopyToast`,`GuideSelected`,`Regenerate`,`CopyAction`,`OpenExternal`,`RevealFolder`]}))();export{u as AllProps,h as CopyAction,f as CopyToast,l as Default,d as EdgeCases,p as GuideSelected,g as OpenExternal,m as Regenerate,_ as RevealFolder,v as __namedExportsOrder,c as default};