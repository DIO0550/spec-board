import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./task-Ci6wIFAY.js";import{n as r,t as i}from"./CommandPalette-oPdb-7c1.js";var a,o,s,c,l,u,d,f,p,m,h,g;e((()=>{t(),r(),{expect:a,fn:o,userEvent:s,within:c}=__STORYBOOK_MODULE_TEST__,l={component:i,parameters:{layout:`fullscreen`},args:{tasks:[n.fromPayload({id:`SB-42`,title:`Keyboard shortcuts`,status:`Todo`,labels:[`a11y`,`frontend`],links:[],children:[],reverseLinks:[],body:``,filePath:`tasks/keyboard-shortcuts.md`}),n.fromPayload({id:`SB-51`,title:`Global search`,status:`In Progress`,labels:[`search`],links:[],children:[],reverseLinks:[],body:``,filePath:`tasks/search/global-search.md`})],isOpen:!1,onOpenChange:o(),onTaskSelect:o(),onNewTask:o(),onSettings:o(),onMilestones:o(),onGuide:o()}},u={},d={args:{isOpen:!0}},f={args:{isOpen:!0,tasks:[n.fromPayload({id:`LONG`,title:`非常に長いタイトルがCommand Paletteの横幅を超えた場合の省略表示を検証するタスク`,status:`Todo`,labels:[`very-long-label`],links:[],children:[],reverseLinks:[],body:``,filePath:`tasks/deep/nested/very-long-file-name.md`}),...Array.from({length:60},(e,t)=>n.fromPayload({id:`SB-BULK-${t}`,title:`大量データ表示上限確認 ${t}`,status:`Todo`,labels:[`performance`],links:[],children:[],reverseLinks:[],body:``,filePath:`tasks/bulk/${t}.md`}))]},play:async({canvasElement:e})=>{let t=c(e);await a(t.getAllByRole(`option`)).toHaveLength(50),await a(t.getByText(/65件中50件を表示/)).toBeVisible()}},p={args:{isOpen:!0},play:async({canvasElement:e})=>{let t=c(e);await a(t.getByRole(`combobox`)).toHaveFocus(),await a(t.getAllByRole(`option`)).toHaveLength(6)}},m={args:{isOpen:!0,tasks:[]},play:async({canvasElement:e})=>{let t=c(e);await s.type(t.getByRole(`combobox`),`no-match`),await a(t.getByText(`一致する項目がありません`)).toBeVisible()}},h={args:{isOpen:!0},play:async({canvasElement:e})=>{let t=c(e).getByRole(`combobox`);await s.type(t,`global`),await s.keyboard(`{Enter}`),await a(l.args?.onTaskSelect).toHaveBeenCalledWith(`SB-51`)}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    isOpen: true
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    isOpen: true,
    tasks: [Task.fromPayload({
      id: "LONG",
      title: "非常に長いタイトルがCommand Paletteの横幅を超えた場合の省略表示を検証するタスク",
      status: "Todo",
      labels: ["very-long-label"],
      links: [],
      children: [],
      reverseLinks: [],
      body: "",
      filePath: "tasks/deep/nested/very-long-file-name.md"
    }), ...Array.from({
      length: 60
    }, (_, index) => Task.fromPayload({
      id: \`SB-BULK-\${index}\`,
      title: \`大量データ表示上限確認 \${index}\`,
      status: "Todo",
      labels: ["performance"],
      links: [],
      children: [],
      reverseLinks: [],
      body: "",
      filePath: \`tasks/bulk/\${index}.md\`
    }))]
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("option")).toHaveLength(50);
    await expect(canvas.getByText(/65件中50件を表示/)).toBeVisible();
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    isOpen: true
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("combobox")).toHaveFocus();
    await expect(canvas.getAllByRole("option")).toHaveLength(6);
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    isOpen: true,
    tasks: []
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("combobox"), "no-match");
    await expect(canvas.getByText("一致する項目がありません")).toBeVisible();
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    isOpen: true
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox");
    await userEvent.type(input, "global");
    await userEvent.keyboard("{Enter}");
    await expect(meta.args?.onTaskSelect).toHaveBeenCalledWith("SB-51");
  }
}`,...h.parameters?.docs?.source}}},g=[`Default`,`AllProps`,`EdgeCases`,`Open`,`Empty`,`Keyboard`]}))();export{d as AllProps,u as Default,f as EdgeCases,m as Empty,h as Keyboard,p as Open,g as __namedExportsOrder,l as default};