import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,r,t as i}from"./AppViewProvider-B-mJEmm7.js";var a,o,s,c,l,u,d,f,p,m;e((()=>{n(),a=t(),{userEvent:o,within:s}=__STORYBOOK_MODULE_TEST__,c=[`board`,`settings`,`detail`,`milestone`,`create`],l=()=>{let{view:e,navigate:t}=r();return(0,a.jsxs)(`section`,{className:`w-[520px] rounded-xl border border-border bg-surface p-5 shadow-sm`,children:[(0,a.jsx)(`p`,{className:`text-xs font-semibold uppercase tracking-wider text-muted`,children:`AppViewProvider`}),(0,a.jsx)(`p`,{className:`mt-2 text-2xl font-semibold text-foreground`,"data-testid":`app-view-current`,children:e}),(0,a.jsx)(`div`,{className:`mt-4 flex flex-wrap gap-2`,children:c.map(e=>(0,a.jsx)(`button`,{type:`button`,onClick:()=>t(e),className:`rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-foreground hover:border-accent`,children:e},e))})]})},u={component:i,args:{children:(0,a.jsx)(l,{})}},d={},f={play:async({canvasElement:e})=>{await o.click(s(e).getByRole(`button`,{name:`detail`}))}},p={play:async({canvasElement:e})=>{let t=s(e);await o.click(t.getByRole(`button`,{name:`settings`})),await o.click(t.getByRole(`button`,{name:`create`}))}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  /**
   * detail ビューへ切り替えた状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "detail"
    }));
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  /**
   * settings から create へ続けて切り替えた状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", {
      name: "settings"
    }));
    await userEvent.click(canvas.getByRole("button", {
      name: "create"
    }));
  }
}`,...p.parameters?.docs?.source}}},m=[`Default`,`AllProps`,`EdgeCases`]}))();export{f as AllProps,d as Default,p as EdgeCases,m as __namedExportsOrder,u as default};