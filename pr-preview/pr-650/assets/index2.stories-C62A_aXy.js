import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,r,t as i}from"./label-definition-DIEQCeLS.js";import{n as a,t as o}from"./CreateLabelForm-BJEIncDM.js";var s,c,l,u,d,f,p,m,h,g,_,v,y;e((()=>{r(),a(),s=t(),{fn:c,userEvent:l,within:u}=__STORYBOOK_MODULE_TEST__,d={name:`needs-design`,description:`デザイン待ちのタスク`,group:`status`,color:`#7860b5`},f={component:o,args:{values:d,editingName:null,isPending:!1,validation:n.validate(d,[],null),groupOptions:[`type`,`priority`,`area`,`status`],onChange:c(),onReset:c(),onSubmit:c()},decorators:[e=>(0,s.jsx)(`div`,{className:`max-w-[1080px] p-6`,children:(0,s.jsx)(e,{})})]},p={},m={args:{editingName:i.fromWire({name:`needs-design`}).name}},h={args:{values:{name:``,description:``,group:``,color:`invalid`},validation:n.validate({name:``,description:``,group:``,color:`invalid`},[],null),groupOptions:[],isPending:!0}},g={play:async({canvasElement:e})=>{await l.click(u(e).getByRole(`combobox`,{name:`グループ`}))}},_={play:async({canvasElement:e})=>{await l.click(u(e).getByRole(`button`,{name:`プリセット purple`})),u(e).getByRole(`textbox`,{name:/カラー/}).focus()}},v={play:async()=>{document.documentElement.dataset.theme=`dark`}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    editingName: LabelDefinition.fromWire({
      name: "needs-design"
    }).name
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    values: {
      name: "",
      description: "",
      group: "",
      color: "invalid"
    },
    validation: LabelDraft.validate({
      name: "",
      description: "",
      group: "",
      color: "invalid"
    }, [], null),
    groupOptions: [],
    isPending: true
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  /**
   * グループ選択を開いた状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByRole("combobox", {
      name: "グループ"
    }));
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  /**
   * カラープリセットを選び、入力へフォーカスした状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "プリセット purple"
    }));
    within(canvasElement).getByRole("textbox", {
      name: /カラー/
    }).focus();
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  /** dark テーマで表示する。 */
  play: async () => {
    document.documentElement.dataset.theme = "dark";
  }
}`,...v.parameters?.docs?.source}}},y=[`Default`,`AllProps`,`EdgeCases`,`GroupOpen`,`ColorOpen`,`Dark`]}))();export{m as AllProps,_ as ColorOpen,v as Dark,p as Default,h as EdgeCases,g as GroupOpen,y as __namedExportsOrder,f as default};