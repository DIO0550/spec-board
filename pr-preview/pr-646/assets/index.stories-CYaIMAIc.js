import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,s as r,t as i}from"./ToastProvider-CPc6Ff74.js";var a,o,s,c,l,u,d,f,p,m;e((()=>{n(),a=t(),{userEvent:o,within:s}=__STORYBOOK_MODULE_TEST__,c=[{type:`success`,message:`タスクを作成しました`},{type:`warning`,message:`リンク切れが 2 件あります`},{type:`error`,message:`プロジェクトを開けませんでした`}],l=()=>{let{toasts:e,showToast:t}=r();return(0,a.jsxs)(`section`,{className:`w-[560px] rounded-xl border border-border bg-surface p-5 shadow-sm`,children:[(0,a.jsx)(`p`,{className:`text-xs font-semibold uppercase tracking-wider text-muted`,children:`ToastProvider`}),(0,a.jsxs)(`h2`,{className:`mt-1 text-lg font-semibold text-foreground`,children:[`通知キュー: `,e.length,`件`]}),(0,a.jsxs)(`div`,{className:`mt-4 flex flex-wrap gap-2`,children:[c.map(e=>(0,a.jsx)(`button`,{type:`button`,onClick:()=>t(e.message,e.type),className:`rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-foreground`,children:e.type},e.type)),(0,a.jsx)(`button`,{type:`button`,onClick:()=>t(`非常に長い通知メッセージ `.repeat(12),`warning`),className:`rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-foreground`,children:`long`})]})]})},u={component:i,args:{children:(0,a.jsx)(l,{}),defaultDurationMs:6e4}},d={},f={play:async({canvasElement:e})=>{let t=s(e);await o.click(t.getByRole(`button`,{name:`success`})),await o.click(t.getByRole(`button`,{name:`warning`})),await o.click(t.getByRole(`button`,{name:`error`}))}},p={play:async({canvasElement:e})=>{await o.click(s(e).getByRole(`button`,{name:`long`}))}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  /**
   * success / warning / error を並べて表示した状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", {
      name: "success"
    }));
    await userEvent.click(canvas.getByRole("button", {
      name: "warning"
    }));
    await userEvent.click(canvas.getByRole("button", {
      name: "error"
    }));
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  /**
   * 長文のtoastを表示した状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "long"
    }));
  }
}`,...p.parameters?.docs?.source}}},m=[`Default`,`AllProps`,`EdgeCases`]}))();export{f as AllProps,d as Default,p as EdgeCases,m as __namedExportsOrder,u as default};