import{a as e,n as t}from"./chunk-BneVvdWh.js";import{t as n}from"./iframe-Cp14ByQm.js";import{a as r,i,n as a,r as o,t as s}from"./TaskCreateScreen-DIGllT01.js";import{t as c}from"./jsx-runtime-Bn1Ys6_W.js";import{n as l,t as u}from"./result-7c-baUo1.js";import{t as d}from"./useTheme-Zi3ZvJey.js";import{t as f}from"./shell-C3nbOr7I.js";import{n as p,t as m}from"./task-8OoHF6Tq.js";import{f as h,n as g}from"./ProjectProvider-CpRQaaHj.js";import{i as _,n as v,r as y}from"./test-fixtures-hBao_jFJ.js";import{n as b,t as x}from"./ToastProvider-6CEakBln.js";var S,C,w,T,E,D,O,k,A,j,M,N,P,F,I,L,R,z,B,V,H,U,W,G,K;t((()=>{i(),S=e(n(),1),f(),g(),b(),v(),p(),l(),a(),C=c(),{expect:w,fireEvent:T,fn:E,userEvent:D,within:O}=__STORYBOOK_MODULE_TEST__,k={parent:m.fromPayload({id:`p-stub`,title:`stub parent`,status:y[0]?.name??`Todo`,labels:[],links:[],children:[],reverseLinks:[],body:``,filePath:`tasks/stub-parent.md`}),failedSubIssues:[]},A=({children:e})=>((0,S.useState)(()=>{r(e=>{if(e===`preview_task_filename`)return{kind:`path`,fileName:`new-issue.md`,relPath:`tasks/new-issue.md`,fullPath:`/workspace/payments-service/tasks/new-issue.md`};if(e===`preview_task_markdown`)return`---
title: New issue
status: Todo
---
`})}),(0,S.useEffect)(()=>o,[]),e),j={component:s,parameters:{layout:`fullscreen`},decorators:[e=>(0,C.jsx)(A,{children:(0,C.jsx)(d,{children:(0,C.jsx)(x,{children:(0,C.jsx)(`div`,{style:{height:`100vh`,width:`100vw`},children:(0,C.jsx)(e,{})})})})})],args:{columns:y,initialStatus:y[0]?.name??`Todo`,parentCandidates:_,existingTasks:_,projectName:`payments-service`,projectPath:`~/work/payments-service`,watchedFileCount:127,onSubmit:E(async()=>u.ok(k)),onClose:E()}},M={},N={args:{initialParent:_[0]?.filePath,parentReadOnly:!1}},P={args:{projectName:`非常に長いプロジェクト名`.repeat(6),projectPath:`/workspace/${`nested/`.repeat(12)}`,watchedFileCount:99999}},F={play:async({canvasElement:e})=>{let t=O(e);await D.type(t.getByTestId(`task-form-title`),`検索結果ページのページネーション`),await D.type(t.getByTestId(`task-form-body`),`## 概要

検索結果をページ単位で表示します。`),T.change(t.getByTestId(`task-form-due`),{target:{value:`2026-09-18`}})}},I={play:async({canvasElement:e})=>{await D.click(O(e).getByTestId(`task-topbar-preview-toggle`))}},L={args:{onSubmit:E(()=>new Promise(()=>{}))},play:async({canvasElement:e})=>{let t=O(e);await D.type(t.getByTestId(`task-form-title`),`作成中タスク`),await D.click(t.getByTestId(`task-form-submit`))}},R={name:`Error`,args:{onSubmit:E(async()=>u.err(h.invalidState(`保存に失敗しました`)))},play:async({canvasElement:e})=>{let t=O(e);await D.type(t.getByTestId(`task-form-title`),`失敗するタスク`),await D.click(t.getByTestId(`task-form-submit`))}},z={args:{initialParent:_[0]?.filePath,parentReadOnly:!0}},B={args:{parentCandidates:[],existingTasks:[],watchedFileCount:0}},V={play:async({canvasElement:e})=>{await D.click(O(e).getByTestId(`status-field`))}},H={play:async({canvasElement:e})=>{await D.click(O(e).getByTestId(`priority-field`))}},U={play:async({canvasElement:e})=>{await D.click(O(e).getByTestId(`task-form-labels`))}},W={play:async({canvasElement:e})=>{await D.click(O(e).getByTestId(`parent-task-input`))}},G={parameters:{viewport:{defaultViewport:`desktop1440`}},play:async({canvasElement:e})=>{let t=O(e).getByTestId(`preview-resizer`);T.pointerDown(t,{pointerId:1,clientX:960}),T.pointerMove(t,{pointerId:1,clientX:900}),T.pointerUp(t,{pointerId:1,clientX:900}),await w(e.querySelector(`[style*='--preview-w']`)?.style.getPropertyValue(`--preview-w`)).toBe(`540px`)}},M.parameters={...M.parameters,docs:{...M.parameters?.docs,source:{originalSource:`{}`,...M.parameters?.docs?.source}}},N.parameters={...N.parameters,docs:{...N.parameters?.docs,source:{originalSource:`{
  args: {
    initialParent: initialTasks[0]?.filePath,
    parentReadOnly: false
  }
}`,...N.parameters?.docs?.source}}},P.parameters={...P.parameters,docs:{...P.parameters?.docs,source:{originalSource:`{
  args: {
    projectName: "非常に長いプロジェクト名".repeat(6),
    projectPath: \`/workspace/\${"nested/".repeat(12)}\`,
    watchedFileCount: 99999
  }
}`,...P.parameters?.docs?.source}}},F.parameters={...F.parameters,docs:{...F.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByTestId("task-form-title"), "検索結果ページのページネーション");
    await userEvent.type(canvas.getByTestId("task-form-body"), "## 概要\\n\\n検索結果をページ単位で表示します。");
    fireEvent.change(canvas.getByTestId("task-form-due"), {
      target: {
        value: "2026-09-18"
      }
    });
  }
}`,...F.parameters?.docs?.source}}},I.parameters={...I.parameters,docs:{...I.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByTestId("task-topbar-preview-toggle"));
  }
}`,...I.parameters?.docs?.source}}},L.parameters={...L.parameters,docs:{...L.parameters?.docs,source:{originalSource:`{
  args: {
    onSubmit: fn(() => new Promise<Result<CreateTaskSubmitOutcome, ProjectError>>(() => {}))
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByTestId("task-form-title"), "作成中タスク");
    await userEvent.click(canvas.getByTestId("task-form-submit"));
  }
}`,...L.parameters?.docs?.source}}},R.parameters={...R.parameters,docs:{...R.parameters?.docs,source:{originalSource:`{
  name: "Error",
  args: {
    onSubmit: fn(async () => Result.err(ProjectError.invalidState("保存に失敗しました")))
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByTestId("task-form-title"), "失敗するタスク");
    await userEvent.click(canvas.getByTestId("task-form-submit"));
  }
}`,...R.parameters?.docs?.source}}},z.parameters={...z.parameters,docs:{...z.parameters?.docs,source:{originalSource:`{
  args: {
    initialParent: initialTasks[0]?.filePath,
    parentReadOnly: true
  }
}`,...z.parameters?.docs?.source}}},B.parameters={...B.parameters,docs:{...B.parameters?.docs,source:{originalSource:`{
  args: {
    parentCandidates: [],
    existingTasks: [],
    watchedFileCount: 0
  }
}`,...B.parameters?.docs?.source}}},V.parameters={...V.parameters,docs:{...V.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByTestId("status-field"));
  }
}`,...V.parameters?.docs?.source}}},H.parameters={...H.parameters,docs:{...H.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByTestId("priority-field"));
  }
}`,...H.parameters?.docs?.source}}},U.parameters={...U.parameters,docs:{...U.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByTestId("task-form-labels"));
  }
}`,...U.parameters?.docs?.source}}},W.parameters={...W.parameters,docs:{...W.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByTestId("parent-task-input"));
  }
}`,...W.parameters?.docs?.source}}},G.parameters={...G.parameters,docs:{...G.parameters?.docs,source:{originalSource:`{
  parameters: {
    viewport: {
      defaultViewport: "desktop1440"
    }
  },
  play: async ({
    canvasElement
  }) => {
    const resizer = within(canvasElement).getByTestId("preview-resizer");
    fireEvent.pointerDown(resizer, {
      pointerId: 1,
      clientX: 960
    });
    fireEvent.pointerMove(resizer, {
      pointerId: 1,
      clientX: 900
    });
    fireEvent.pointerUp(resizer, {
      pointerId: 1,
      clientX: 900
    });
    const grid = canvasElement.querySelector<HTMLElement>("[style*='--preview-w']");
    await expect(grid?.style.getPropertyValue("--preview-w")).toBe("540px");
  }
}`,...G.parameters?.docs?.source}}},K=[`Default`,`AllProps`,`EdgeCases`,`Filled`,`Collapsed`,`Submitting`,`ErrorState`,`SubIssue`,`EmptyProject`,`StatusPopoverOpen`,`PriorityPopoverOpen`,`LabelsPopoverOpen`,`ParentPopoverOpen`,`Resized`]}))();export{N as AllProps,I as Collapsed,M as Default,P as EdgeCases,B as EmptyProject,R as ErrorState,F as Filled,U as LabelsPopoverOpen,W as ParentPopoverOpen,H as PriorityPopoverOpen,G as Resized,V as StatusPopoverOpen,z as SubIssue,L as Submitting,K as __namedExportsOrder,j as default};