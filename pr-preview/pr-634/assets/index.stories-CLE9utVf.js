import{a as e,n as t}from"./chunk-BneVvdWh.js";import{t as n}from"./iframe-CihYHKsD.js";import{t as r}from"./jsx-runtime-Bn1Ys6_W.js";import{a as i,o as a}from"./ProjectProvider-CDJyTDUK.js";import{n as o,r as s,t as c}from"./RecentProjectsProvider-BDJc_hfB.js";import{n as l,o as u,t as d}from"./ToastProvider-jiLBEQjO.js";import{n as f,t as p}from"./ProjectNotificationsProvider-DmqU8q8m.js";var m,h,g,_,v,y,b,x,S,C,w,T;t((()=>{m=e(n(),1),a(),o(),l(),f(),h=r(),{userEvent:g,within:_}=__STORYBOOK_MODULE_TEST__,v=()=>{let e=new Set;return{value:{subscribe:t=>(e.add(t),()=>{e.delete(t)})},emit:t=>{e.forEach(e=>{e(t)})}}},y=({emit:e})=>{let{toasts:t}=u(),{projects:n}=s();return(0,h.jsxs)(`section`,{className:`w-[640px] rounded-xl border border-border bg-surface p-5 shadow-sm`,children:[(0,h.jsx)(`p`,{className:`text-xs font-semibold uppercase tracking-wider text-muted`,children:`ProjectNotificationsProvider`}),(0,h.jsx)(`h2`,{className:`mt-1 text-lg font-semibold text-foreground`,children:`イベント通知ブリッジ`}),(0,h.jsxs)(`div`,{className:`mt-4 grid grid-cols-2 gap-3`,children:[(0,h.jsxs)(`div`,{className:`rounded-lg border border-border bg-surface-muted p-3`,children:[(0,h.jsx)(`p`,{className:`text-xs text-muted`,children:`Toast`}),(0,h.jsx)(`p`,{className:`text-2xl font-semibold text-foreground`,children:t.length})]}),(0,h.jsxs)(`div`,{className:`rounded-lg border border-border bg-surface-muted p-3`,children:[(0,h.jsx)(`p`,{className:`text-xs text-muted`,children:`Recent projects`}),(0,h.jsx)(`p`,{className:`text-2xl font-semibold text-foreground`,children:n.length})]})]}),(0,h.jsxs)(`div`,{className:`mt-4 flex flex-wrap gap-2`,children:[(0,h.jsx)(`button`,{type:`button`,onClick:()=>e({type:`watcher-diagnostic`,code:`resourceExhausted`,message:`watch limit`,changeId:`story-warning`}),className:`rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900`,children:`監視warning`}),(0,h.jsx)(`button`,{type:`button`,onClick:()=>e({type:`open-error`,error:{kind:`invalid-state`,message:`プロジェクトを開けませんでした`}}),className:`rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900`,children:`open error`})]})]})},b=()=>{let e=(0,m.useMemo)(v,[]);return(0,h.jsx)(d,{defaultDurationMs:6e4,children:(0,h.jsx)(c,{children:(0,h.jsx)(i.Provider,{value:e.value,children:(0,h.jsx)(p,{children:(0,h.jsx)(y,{emit:e.emit})})})})})},x={component:b},S={},C={play:async({canvasElement:e})=>{await g.click(_(e).getByRole(`button`,{name:`監視warning`}))}},w={play:async({canvasElement:e})=>{let t=_(e);await g.click(t.getByRole(`button`,{name:`監視warning`})),await g.click(t.getByRole(`button`,{name:`open error`}))}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  /**
   * 監視warningを発火させ、toastが出た状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "監視warning"
    }));
  }
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  /**
   * 監視warningとopen errorを続けて発火させた状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", {
      name: "監視warning"
    }));
    await userEvent.click(canvas.getByRole("button", {
      name: "open error"
    }));
  }
}`,...w.parameters?.docs?.source}}},T=[`Default`,`AllProps`,`EdgeCases`]}))();export{C as AllProps,S as Default,w as EdgeCases,T as __namedExportsOrder,x as default};