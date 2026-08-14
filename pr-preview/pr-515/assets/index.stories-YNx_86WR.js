import{n as e}from"./chunk-BneVvdWh.js";import{i as t,n,r}from"./test-fixtures-hBao_jFJ.js";import{n as i,t as a}from"./TaskForm-D0JRJFe8.js";var o,s,c,l,u,d,f,p,m,h,g,_,v;e((()=>{n(),i(),{fn:o,userEvent:s,within:c}=__STORYBOOK_MODULE_TEST__,l={component:a,args:{columns:r,initialStatus:`Todo`,onSubmit:o(),onCancel:o()}},u={},d={args:{parentCandidates:t,existingTasks:t,submitLabel:`タスクを作成`,cancelLabel:`キャンセル`}},f={args:{columns:[{name:`非常に長いステータス名`.repeat(4),order:0}]}},p={},m={args:{parentCandidates:t,existingTasks:t},play:async({canvasElement:e})=>{let t=c(e);await s.type(t.getByTestId(`task-form-title`),`入力済みタスク`),await s.type(t.getByTestId(`task-form-body`),`Markdown本文`)}},h={args:{isSubmitting:!0}},g={args:{parentCandidates:t}},_={args:{existingTasks:t}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    parentCandidates: initialTasks,
    existingTasks: initialTasks,
    submitLabel: "タスクを作成",
    cancelLabel: "キャンセル"
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    columns: [{
      name: "非常に長いステータス名".repeat(4),
      order: 0
    }]
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    parentCandidates: initialTasks,
    existingTasks: initialTasks
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByTestId("task-form-title"), "入力済みタスク");
    await userEvent.type(canvas.getByTestId("task-form-body"), "Markdown本文");
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    isSubmitting: true
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    parentCandidates: initialTasks
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    existingTasks: initialTasks
  }
}`,..._.parameters?.docs?.source}}},v=[`Default`,`AllProps`,`EdgeCases`,`Empty`,`Filled`,`Submitting`,`WithParentCandidates`,`WithPathPreview`]}))();export{d as AllProps,u as Default,f as EdgeCases,p as Empty,m as Filled,h as Submitting,g as WithParentCandidates,_ as WithPathPreview,v as __namedExportsOrder,l as default};