import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,t as r}from"./StatusSettingsTab-C4_eIqul.js";var i,a,o,s,c,l,u,d,f,p,m,h;e((()=>{n(),i=t(),{fn:a,userEvent:o,within:s}=__STORYBOOK_MODULE_TEST__,c={component:r,args:{onSave:a(),onOpenBoard:a(),onOpenConfig:a()},parameters:{layout:`fullscreen`},decorators:[e=>(0,i.jsx)(`div`,{className:`min-h-screen bg-background px-8 py-6`,children:(0,i.jsx)(e,{})})]},l={},u={args:{saveState:`saved`}},d={args:{initialColumns:[{id:`only`,name:`Done with an unusually long column name`,taskCount:0,color:`#7860b5`}],initialDoneColumn:`Done with an unusually long column name`,saveState:`error`}},f={args:{saveState:`saving`}},p={play:async({canvasElement:e})=>{await o.type(s(e).getByRole(`textbox`,{name:`新しいカラム名`}),`Blocked`),await o.click(s(e).getByRole(`button`,{name:`カラムを追加`}))}},m={name:`Error`,args:{saveState:`error`}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    saveState: "saved"
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    initialColumns: [{
      id: "only",
      name: "Done with an unusually long column name",
      taskCount: 0,
      color: "#7860b5"
    }],
    initialDoneColumn: "Done with an unusually long column name",
    saveState: "error"
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    saveState: "saving"
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  /**
   * 新しいカラム名を入力し、未保存の変更がある状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    await userEvent.type(within(canvasElement).getByRole("textbox", {
      name: "新しいカラム名"
    }), "Blocked");
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "カラムを追加"
    }));
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  name: "Error",
  args: {
    saveState: "error"
  }
}`,...m.parameters?.docs?.source}}},h=[`Default`,`AllProps`,`EdgeCases`,`Saving`,`Dirty`,`ErrorState`]}))();export{u as AllProps,l as Default,p as Dirty,d as EdgeCases,m as ErrorState,f as Saving,h as __namedExportsOrder,c as default};