import{a as e,n as t}from"./chunk-BneVvdWh.js";import{t as n}from"./iframe-hIcIM09B.js";import{a as r,i,n as a,r as o,t as s}from"./TaskCreateScreen-CHIA5SFv.js";import{t as c}from"./jsx-runtime-Bn1Ys6_W.js";import{n as l,t as u}from"./result-DYUyfXdh.js";import{t as d}from"./useTheme-BlLK6HIW.js";import{t as f}from"./shell-CUbgTnjd.js";import{n as p,t as m}from"./task-DjrcEorc.js";import{f as h,n as g}from"./ProjectProvider-B6a0TN33.js";import{i as _,n as v,r as y}from"./test-fixtures-BogoZePH.js";import{r as b,t as x}from"./label-definition-BpRSXVXS.js";import{n as S,t as C}from"./ToastProvider-BT_Jh_4J.js";var w,T,E,D,O,k,A,j,M,N,P,F,I,L,R,z,B,V,H,U,W,G,K,q,J,Y;t((()=>{i(),w=e(n(),1),b(),f(),g(),S(),v(),p(),l(),a(),T=c(),{expect:E,fireEvent:D,fn:O,userEvent:k,within:A}=__STORYBOOK_MODULE_TEST__,j={parent:m.fromPayload({id:`p-stub`,title:`stub parent`,status:y[0]?.name??`Todo`,labels:[],links:[],children:[],reverseLinks:[],body:``,filePath:`tasks/stub-parent.md`}),failedSubIssues:[]},M=({children:e})=>((0,w.useState)(()=>{r(e=>{if(e===`preview_task_filename`)return{kind:`path`,fileName:`new-issue.md`,relPath:`tasks/new-issue.md`,fullPath:`/workspace/payments-service/tasks/new-issue.md`};if(e===`get_task_templates`)return{templates:[{name:`bug-report`,title:`バグ報告`,status:`Todo`,priority:`High`,labels:[`bug`],links:[],draft:!1,body:`## 再現手順

1. `}]};if(e===`preview_task_markdown`)return`---
title: New issue
status: Todo
---
`})}),(0,w.useEffect)(()=>o,[]),e),N=[x.fromWire({name:`bug`,color:`#e11d48`}),x.fromWire({name:`feature`,color:`#16a34a`}),x.fromWire({name:`enhancement`,color:`#2563eb`}),x.fromWire({name:`documentation`,color:`#d97706`}),x.fromWire({name:`good first issue`,color:`#7c3aed`}),x.fromWire({name:`help wanted`,color:`#0891b2`})],P={component:s,parameters:{layout:`fullscreen`},decorators:[e=>(0,T.jsx)(M,{children:(0,T.jsx)(d,{children:(0,T.jsx)(C,{children:(0,T.jsx)(`div`,{style:{height:`100vh`,width:`100vw`},children:(0,T.jsx)(e,{})})})})})],args:{columns:y,initialStatus:y[0]?.name??`Todo`,parentCandidates:_,existingTasks:_,projectName:`payments-service`,projectPath:`~/work/payments-service`,labelSuggestions:N,watchedFileCount:127,onSubmit:O(async()=>u.ok(j)),onClose:O()}},F={},I={args:{initialParent:_[0]?.filePath,parentReadOnly:!1}},L={args:{projectName:`非常に長いプロジェクト名`.repeat(6),projectPath:`/workspace/${`nested/`.repeat(12)}`,watchedFileCount:99999}},R={play:async({canvasElement:e})=>{let t=A(e);await k.type(t.getByTestId(`task-form-title`),`検索結果ページのページネーション`),await k.type(t.getByTestId(`task-form-body`),`## 概要

検索結果をページ単位で表示します。`),D.change(t.getByTestId(`task-form-due`),{target:{value:`2026-09-18`}})}},z={play:async({canvasElement:e})=>{await k.click(A(e).getByTestId(`task-topbar-preview-toggle`))}},B={args:{onSubmit:O(()=>new Promise(()=>{}))},play:async({canvasElement:e})=>{let t=A(e);await k.type(t.getByTestId(`task-form-title`),`作成中タスク`),await k.click(t.getByTestId(`task-form-submit`))}},V={name:`Error`,args:{onSubmit:O(async()=>u.err(h.invalidState(`保存に失敗しました`)))},play:async({canvasElement:e})=>{let t=A(e);await k.type(t.getByTestId(`task-form-title`),`失敗するタスク`),await k.click(t.getByTestId(`task-form-submit`))}},H={args:{initialParent:_[0]?.filePath,parentReadOnly:!0}},U={args:{parentCandidates:[],existingTasks:[],watchedFileCount:0}},W={play:async({canvasElement:e})=>{await k.click(A(e).getByTestId(`status-field`))}},G={play:async({canvasElement:e})=>{await k.click(A(e).getByTestId(`priority-field`))}},K={play:async({canvasElement:e})=>{await k.click(A(e).getByTestId(`task-form-labels`))}},q={play:async({canvasElement:e})=>{await k.click(A(e).getByTestId(`parent-task-input`))}},J={parameters:{viewport:{defaultViewport:`desktop1440`}},play:async({canvasElement:e})=>{let t=A(e).getByTestId(`preview-resizer`);D.pointerDown(t,{pointerId:1,clientX:960}),D.pointerMove(t,{pointerId:1,clientX:900}),D.pointerUp(t,{pointerId:1,clientX:900}),await E(e.querySelector(`[style*='--preview-w']`)?.style.getPropertyValue(`--preview-w`)).toBe(`540px`)}},F.parameters={...F.parameters,docs:{...F.parameters?.docs,source:{originalSource:`{}`,...F.parameters?.docs?.source}}},I.parameters={...I.parameters,docs:{...I.parameters?.docs,source:{originalSource:`{
  args: {
    initialParent: initialTasks[0]?.filePath,
    parentReadOnly: false
  }
}`,...I.parameters?.docs?.source}}},L.parameters={...L.parameters,docs:{...L.parameters?.docs,source:{originalSource:`{
  args: {
    projectName: "非常に長いプロジェクト名".repeat(6),
    projectPath: \`/workspace/\${"nested/".repeat(12)}\`,
    watchedFileCount: 99999
  }
}`,...L.parameters?.docs?.source}}},R.parameters={...R.parameters,docs:{...R.parameters?.docs,source:{originalSource:`{
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
}`,...R.parameters?.docs?.source}}},z.parameters={...z.parameters,docs:{...z.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByTestId("task-topbar-preview-toggle"));
  }
}`,...z.parameters?.docs?.source}}},B.parameters={...B.parameters,docs:{...B.parameters?.docs,source:{originalSource:`{
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
}`,...B.parameters?.docs?.source}}},V.parameters={...V.parameters,docs:{...V.parameters?.docs,source:{originalSource:`{
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
}`,...V.parameters?.docs?.source}}},H.parameters={...H.parameters,docs:{...H.parameters?.docs,source:{originalSource:`{
  args: {
    initialParent: initialTasks[0]?.filePath,
    parentReadOnly: true
  }
}`,...H.parameters?.docs?.source}}},U.parameters={...U.parameters,docs:{...U.parameters?.docs,source:{originalSource:`{
  args: {
    parentCandidates: [],
    existingTasks: [],
    watchedFileCount: 0
  }
}`,...U.parameters?.docs?.source}}},W.parameters={...W.parameters,docs:{...W.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByTestId("status-field"));
  }
}`,...W.parameters?.docs?.source}}},G.parameters={...G.parameters,docs:{...G.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByTestId("priority-field"));
  }
}`,...G.parameters?.docs?.source}}},K.parameters={...K.parameters,docs:{...K.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByTestId("task-form-labels"));
  }
}`,...K.parameters?.docs?.source}}},q.parameters={...q.parameters,docs:{...q.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByTestId("parent-task-input"));
  }
}`,...q.parameters?.docs?.source}}},J.parameters={...J.parameters,docs:{...J.parameters?.docs,source:{originalSource:`{
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
}`,...J.parameters?.docs?.source}}},Y=[`Default`,`AllProps`,`EdgeCases`,`Filled`,`Collapsed`,`Submitting`,`ErrorState`,`SubIssue`,`EmptyProject`,`StatusPopoverOpen`,`PriorityPopoverOpen`,`LabelsPopoverOpen`,`ParentPopoverOpen`,`Resized`]}))();export{I as AllProps,z as Collapsed,F as Default,L as EdgeCases,U as EmptyProject,V as ErrorState,R as Filled,K as LabelsPopoverOpen,q as ParentPopoverOpen,G as PriorityPopoverOpen,J as Resized,W as StatusPopoverOpen,H as SubIssue,B as Submitting,Y as __namedExportsOrder,P as default};