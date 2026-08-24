import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{t as n,z as r}from"./tauri-B7lPraee.js";import{n as i,t as a}from"./PreviewPane-zlHUx_2i.js";var o,s,c,l,u,d,f,p,m,h,g,_,v;e((()=>{n(),i(),o=t(),{fn:s,userEvent:c,within:l}=__STORYBOOK_MODULE_TEST__,u={component:a,args:{state:{kind:`ready`,markdown:`---
title: 検索結果ページのページネーション
status: In Progress
priority: High
labels:
  - frontend
due: 2026-09-18
---
## 概要

検索結果をページ単位で表示します。

- [ ] APIを実装
- [x] UIを設計`,error:null},fileName:`search-pagination.md`,onCollapse:s()},parameters:{layout:`fullscreen`},decorators:[e=>(0,o.jsx)(`div`,{className:`ml-auto h-[680px] w-[480px]`,children:(0,o.jsx)(e,{})})]},d={},f={},p={args:{state:{kind:`ready`,markdown:`---\ntitle: '${`非常に長いタイトル`.repeat(10)}'\nstatus: Todo\n---\n`,error:null},fileName:`${`long-file-name-`.repeat(8)}.md`}},m={args:{state:{kind:`ready`,markdown:`---
title: ''
status: Todo
---
`,error:null}}},h={play:async({canvasElement:e})=>{await c.click(l(e).getByRole(`button`,{name:`Raw`}))}},g={args:{state:{kind:`pending`,markdown:null,error:null}}},_={name:`Error`,args:{state:{kind:`error`,markdown:null,error:new r(`PARSE_ERROR`,`プレビューを生成できません`)}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    state: {
      kind: "ready",
      markdown: \`---\\ntitle: '\${"非常に長いタイトル".repeat(10)}'\\nstatus: Todo\\n---\\n\`,
      error: null
    },
    fileName: \`\${"long-file-name-".repeat(8)}.md\`
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    state: {
      kind: "ready",
      markdown: "---\\ntitle: ''\\nstatus: Todo\\n---\\n",
      error: null
    }
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  /**
   * Raw 表示へ切り替えた状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({
    canvasElement
  }) => {
    await userEvent.click(within(canvasElement).getByRole("button", {
      name: "Raw"
    }));
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    state: {
      kind: "pending",
      markdown: null,
      error: null
    }
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  name: "Error",
  args: {
    state: {
      kind: "error",
      markdown: null,
      error: new TauriError("PARSE_ERROR", "プレビューを生成できません")
    }
  }
}`,..._.parameters?.docs?.source}}},v=[`Default`,`AllProps`,`EdgeCases`,`Empty`,`Raw`,`Loading`,`ErrorState`]}))();export{f as AllProps,d as Default,p as EdgeCases,m as Empty,_ as ErrorState,g as Loading,h as Raw,v as __namedExportsOrder,u as default};