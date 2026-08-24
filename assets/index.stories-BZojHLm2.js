import{n as e}from"./chunk-BneVvdWh.js";import{i as t,n}from"./test-fixtures-BoFO4AXL.js";import{n as r,t as i}from"./TaskFormLinks-CNc24xFp.js";var a,o,s,c,l,u,d,f,p,m,h,g,_;e((()=>{n(),r(),{fn:a,userEvent:o,within:s}=__STORYBOOK_MODULE_TEST__,c=t.slice(0,2),l={component:i,args:{links:c.map(e=>e.filePath),selectedTasks:c,candidates:t.slice(2),onAdd:a(),onRemove:a(),disabled:!1}},u={},d={},f={args:{links:[`tasks/missing.md`],selectedTasks:[],candidates:[]}},p={args:{links:[],selectedTasks:[],candidates:[]}},m={},h={args:{links:[],selectedTasks:[],candidates:t},play:async({canvasElement:e})=>{await o.click(s(e).getByPlaceholderText(`関連タスクを検索して追加`))}},g={args:{disabled:!0}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    links: ["tasks/missing.md"],
    selectedTasks: [],
    candidates: []
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    links: [],
    selectedTasks: [],
    candidates: []
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    links: [],
    selectedTasks: [],
    candidates: initialTasks
  },
  /**
   * 関連タスクの検索入力を開いた状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByPlaceholderText("関連タスクを検索して追加"));
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    disabled: true
  }
}`,...g.parameters?.docs?.source}}},_=[`Default`,`AllProps`,`EdgeCases`,`Empty`,`Filled`,`Open`,`Submitting`]}))();export{d as AllProps,u as Default,f as EdgeCases,p as Empty,m as Filled,h as Open,g as Submitting,_ as __namedExportsOrder,l as default};