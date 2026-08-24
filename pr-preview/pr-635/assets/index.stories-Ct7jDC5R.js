import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{a as n,i as r,n as i,r as a,t as o}from"./RecentProjectsProvider-DThGQpEH.js";var s,c,l,u,d,f,p,m,h,g;e((()=>{n(),i(),s=t(),{userEvent:c,within:l}=__STORYBOOK_MODULE_TEST__,u=()=>{let{projects:e,add:t}=a();return(0,s.jsxs)(`section`,{className:`w-[600px] rounded-xl border border-border bg-surface p-5 shadow-sm`,children:[(0,s.jsxs)(`div`,{className:`flex items-center gap-3`,children:[(0,s.jsxs)(`div`,{children:[(0,s.jsx)(`p`,{className:`text-xs font-semibold uppercase tracking-wider text-muted`,children:`RecentProjectsProvider`}),(0,s.jsx)(`h2`,{className:`text-lg font-semibold text-foreground`,children:`最近開いたプロジェクト`})]}),(0,s.jsxs)(`span`,{className:`ml-auto rounded-full bg-accent-soft px-2 py-1 text-xs text-accent`,children:[e.length,`件`]})]}),e.length===0?(0,s.jsx)(`p`,{className:`mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted`,children:`履歴はありません`}):(0,s.jsx)(`ul`,{className:`mt-4 divide-y divide-border rounded-lg border border-border`,children:e.map(e=>(0,s.jsxs)(`li`,{className:`px-3 py-2.5`,children:[(0,s.jsx)(`p`,{className:`font-medium text-foreground`,children:e.name}),(0,s.jsx)(`p`,{className:`truncate font-mono text-xs text-muted`,children:e.path})]},e.path))}),(0,s.jsx)(`button`,{type:`button`,onClick:()=>t(`/workspace/new-project`),className:`mt-4 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground`,children:`履歴へ追加`})]})},d=e=>t=>(localStorage.setItem(r,JSON.stringify(e.map(e=>{let t=e.split(`/`);return{path:e,name:t[t.length-1]??e}}))),(0,s.jsx)(t,{})),f={component:o,args:{children:(0,s.jsx)(u,{})}},p={decorators:[d([])]},m={decorators:[d([`/workspace/spec-board`,`/workspace/payments-service`,`/workspace/design-system`])],play:async({canvasElement:e})=>{await c.click(l(e).getByRole(`button`,{name:`履歴へ追加`}))}},h={decorators:[d(Array.from({length:10},(e,t)=>`/workspace/${`very-long-segment/`.repeat(4)}project-${t+1}`))]},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  decorators: [withRecentProjects([])]
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  decorators: [withRecentProjects(["/workspace/spec-board", "/workspace/payments-service", "/workspace/design-system"])],
  /**
   * 履歴へ追加した直後の状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "履歴へ追加"
    }));
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  decorators: [withRecentProjects(Array.from({
    length: 10
  }, (_, index) => \`/workspace/\${"very-long-segment/".repeat(4)}project-\${index + 1}\`))]
}`,...h.parameters?.docs?.source}}},g=[`Default`,`AllProps`,`EdgeCases`]}))();export{m as AllProps,p as Default,h as EdgeCases,g as __namedExportsOrder,f as default};