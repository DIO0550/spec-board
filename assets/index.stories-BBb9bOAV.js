import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,r,t as i}from"./useTheme-C_SsYHeW.js";var a,o,s,c,l,u,d,f,p,m;e((()=>{n(),a=t(),{userEvent:o,within:s}=__STORYBOOK_MODULE_TEST__,c=()=>{let{appearance:e,resolvedTheme:t,setAccent:n,setDensity:i,setTheme:o}=r();return(0,a.jsxs)(`section`,{className:`w-[520px] rounded-xl border border-border bg-surface p-5 shadow-sm`,children:[(0,a.jsx)(`p`,{className:`text-xs font-semibold uppercase tracking-wider text-muted`,children:`ThemeProvider`}),(0,a.jsxs)(`h2`,{className:`mt-2 text-xl font-semibold text-foreground`,children:[e.theme,` / `,t]}),(0,a.jsxs)(`p`,{className:`mt-1 text-sm text-muted`,children:[e.density,` density · `,e.accent,` accent`]}),(0,a.jsxs)(`div`,{className:`mt-4 flex flex-wrap gap-2`,children:[(0,a.jsx)(`button`,{type:`button`,onClick:()=>o(`dark`),children:`Dark`}),(0,a.jsx)(`button`,{type:`button`,onClick:()=>o(`system`),children:`System`}),(0,a.jsx)(`button`,{type:`button`,onClick:()=>i(`compact`),children:`Compact`}),(0,a.jsx)(`button`,{type:`button`,onClick:()=>n(`rose`),children:`Rose`})]})]})},l=()=>(0,a.jsx)(i,{children:(0,a.jsx)(c,{})}),u={component:l},d={},f={play:async({canvasElement:e})=>{let t=s(e);await o.click(t.getByRole(`button`,{name:`Dark`})),await o.click(t.getByRole(`button`,{name:`Compact`})),await o.click(t.getByRole(`button`,{name:`Rose`}))}},p={play:async({canvasElement:e})=>{await o.click(s(e).getByRole(`button`,{name:`System`}))}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", {
      name: "Dark"
    }));
    await userEvent.click(canvas.getByRole("button", {
      name: "Compact"
    }));
    await userEvent.click(canvas.getByRole("button", {
      name: "Rose"
    }));
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "System"
    }));
  }
}`,...p.parameters?.docs?.source}}},m=[`Default`,`AllProps`,`EdgeCases`]}))();export{f as AllProps,d as Default,p as EdgeCases,m as __namedExportsOrder,u as default};