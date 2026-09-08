import{n as e}from"./chunk-BneVvdWh.js";import{i as t,n,r}from"./test-fixtures-BogoZePH.js";import{r as i,t as a}from"./label-definition-BpRSXVXS.js";import{n as o,t as s}from"./TaskForm-DV7Woone.js";var c,l,u,d,f,p,m,h,g,_,v,y,b;e((()=>{i(),n(),o(),{fn:c,userEvent:l,within:u}=__STORYBOOK_MODULE_TEST__,d={component:s,args:{columns:r,initialStatus:`Todo`,labelSuggestions:a.listFromWire([{name:`bug`,color:`red`},{name:`feature`,color:`blue`},{name:`docs`}]),onSubmit:c(),onCancel:c()}},f={},p={args:{parentCandidates:t,existingTasks:t,submitLabel:`タスクを作成`,cancelLabel:`キャンセル`}},m={args:{columns:[{name:`非常に長いステータス名`.repeat(4),order:0}]}},h={},g={args:{parentCandidates:t,existingTasks:t},play:async({canvasElement:e})=>{let t=u(e);await l.type(t.getByTestId(`task-form-title`),`入力済みタスク`),await l.type(t.getByTestId(`task-form-body`),`Markdown本文`)}},_={args:{isSubmitting:!0}},v={args:{parentCandidates:t}},y={args:{existingTasks:t}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    parentCandidates: initialTasks,
    existingTasks: initialTasks,
    submitLabel: "タスクを作成",
    cancelLabel: "キャンセル"
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    columns: [{
      name: "非常に長いステータス名".repeat(4),
      order: 0
    }]
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
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
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    isSubmitting: true
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    parentCandidates: initialTasks
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    existingTasks: initialTasks
  }
}`,...y.parameters?.docs?.source}}},b=[`Default`,`AllProps`,`EdgeCases`,`Empty`,`Filled`,`Submitting`,`WithParentCandidates`,`WithPathPreview`]}))();export{p as AllProps,f as Default,m as EdgeCases,h as Empty,g as Filled,_ as Submitting,v as WithParentCandidates,y as WithPathPreview,b as __namedExportsOrder,d as default};