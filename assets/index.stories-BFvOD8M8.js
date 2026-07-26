import{n as e}from"./chunk-BneVvdWh.js";import{n as t,t as n}from"./MilestoneRoadmap-B8qVVDnN.js";var r,i,a,o,s,c,l,u;e((()=>{t(),{fn:r}=__STORYBOOK_MODULE_TEST__,i=[{name:`v1.4`,title:`v1.4 — リリース済`,due:`2026-05-31`,state:`closed`},{name:`sprint-24`,title:`Sprint 24 — 安定化`,due:`2026-06-18`,state:`open`},{name:`v1.5`,title:`v1.5 — 検索 & フィルター`,due:`2026-07-10`,state:`open`},{name:`v1.6`,title:`v1.6 — 通知センター`,due:`2026-08-25`,state:`open`},{name:`ops-2026q3`,title:`Ops 2026Q3`,due:`2026-09-01`,state:`open`},{name:`v1.7`,title:`v1.7 — レポート`,due:`2026-10-05`,state:`open`}],a={component:n,parameters:{layout:`padded`},args:{milestones:i,selectedName:void 0,onSelect:r()}},o={},s={args:{selectedName:`v1.5`}},c={args:{milestones:[i[2]]}},l={args:{milestones:[{name:`no-due`,title:`期日未設定のもの`,state:`open`}]}},o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{}`,...o.parameters?.docs?.source},description:{story:`標準表示（今月起点・複数マイルストーンが帯で並ぶ）。`,...o.parameters?.docs?.description}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    selectedName: "v1.5"
  }
}`,...s.parameters?.docs?.source},description:{story:`v1.5 が選択されている状態（accent-soft の枠が出る）。`,...s.parameters?.docs?.description}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    milestones: [SAMPLE_MILESTONES[2]]
  }
}`,...c.parameters?.docs?.source},description:{story:`マイルストーンが 1 件のみ（最小ケース）。`,...c.parameters?.docs?.description}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    milestones: [{
      name: "no-due",
      title: "期日未設定のもの",
      state: "open"
    }]
  }
}`,...l.parameters?.docs?.source},description:{story:`期日設定のあるマイルストーン 0 件（空状態メッセージ）。`,...l.parameters?.docs?.description}}},u=[`Default`,`WithSelection`,`SingleMilestone`,`Empty`]}))();export{o as Default,l as Empty,c as SingleMilestone,s as WithSelection,u as __namedExportsOrder,a as default};