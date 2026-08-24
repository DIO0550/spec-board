import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./project-load-warning-DVUjoMQK.js";import{n as r,t as i}from"./ProjectLoadWarnings-CQWEn8Aa.js";var a,o,s,c,l,u,d,f;e((()=>{t(),r(),a=n.fromPayload({code:`unreadableFile`,stage:`read`,path:`tasks/private-task.md`,message:`ファイルを読み取る権限がありませんでした。`,recoverable:!0}),o=n.fromPayload({code:`frontmatterParseFailed`,stage:`parse`,path:`tasks/invalid-frontmatter.md`,message:`frontmatterの形式が正しくないため既定値を使用しました。`,recoverable:!0}),s={component:i,args:{warnings:[a]},argTypes:{warnings:{control:`object`}},parameters:{layout:`fullscreen`}},c={},l={args:{warnings:[a,o]}},u={args:{warnings:[n.fromPayload({code:`unknown-code`,stage:`unknown-stage`,path:`very/deeply/nested/path/to/a/problematic-task-file.md`,message:``,recoverable:!0})]}},d={args:{warnings:[]}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    warnings: [unreadableWarning, parseWarning]
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    warnings: [ProjectLoadWarning.fromPayload({
      code: "unknown-code",
      stage: "unknown-stage",
      path: "very/deeply/nested/path/to/a/problematic-task-file.md",
      message: "",
      recoverable: true
    })]
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    warnings: []
  }
}`,...d.parameters?.docs?.source}}},f=[`Default`,`AllProps`,`EdgeCases`,`Empty`]}))();export{l as AllProps,c as Default,u as EdgeCases,d as Empty,f as __namedExportsOrder,s as default};