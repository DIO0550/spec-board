import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./MilestoneRoadmap-DTISMM19.js";var r,i,a,o,s,c,l,u,d,f,p;e((()=>{t(),{fn:r}=__STORYBOOK_MODULE_TEST__,i=new Date(`2026-04-15T12:00:00Z`),a=[{name:`v1.4`,title:`v1.4 — リリース済`,due:`2026-05-31`,state:`closed`},{name:`sprint-24`,title:`Sprint 24 — 安定化`,due:`2026-06-18`,state:`open`},{name:`v1.5`,title:`v1.5 — 検索 & フィルター`,due:`2026-07-10`,state:`open`},{name:`v1.6`,title:`v1.6 — 通知センター`,due:`2026-08-25`,state:`open`},{name:`ops-2026q3`,title:`Ops 2026Q3`,due:`2026-09-01`,state:`open`},{name:`v1.7`,title:`v1.7 — レポート`,due:`2026-10-05`,state:`open`}],o={component:n,parameters:{layout:`padded`},args:{milestones:a,selectedName:void 0,onSelect:r(),now:i}},s={},c={args:{selectedName:`v1.5`}},l={args:{milestones:[a[2]]}},u={args:{milestones:[{name:`no-due`,title:`期日未設定のもの`,state:`open`}]}},d={...c},f={...l},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{}`,...s.parameters?.docs?.source},description:{story:`標準表示（今月起点・複数マイルストーンが帯で並ぶ）。`,...s.parameters?.docs?.description}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    selectedName: "v1.5"
  }
}`,...c.parameters?.docs?.source},description:{story:`v1.5 が選択されている状態（accent-soft の枠が出る）。`,...c.parameters?.docs?.description}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    milestones: [SAMPLE_MILESTONES[2]]
  }
}`,...l.parameters?.docs?.source},description:{story:`マイルストーンが 1 件のみ（最小ケース）。`,...l.parameters?.docs?.description}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    milestones: [{
      name: "no-due",
      title: "期日未設定のもの",
      state: "open"
    }]
  }
}`,...u.parameters?.docs?.source},description:{story:`期日設定のあるマイルストーン 0 件（空状態メッセージ）。`,...u.parameters?.docs?.description}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  ...WithSelection
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  ...SingleMilestone
}`,...f.parameters?.docs?.source}}},p=[`Default`,`WithSelection`,`SingleMilestone`,`Empty`,`AllProps`,`EdgeCases`]}))();export{d as AllProps,s as Default,f as EdgeCases,u as Empty,l as SingleMilestone,c as WithSelection,p as __namedExportsOrder,o as default};