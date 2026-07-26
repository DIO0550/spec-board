import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-B6lWK8m9.js";import{n,t as r}from"./task-_q2yRc2s.js";var i,a,o=e((()=>{i=t(),a=e=>{let{task:t}=e;return t.warnings.some(e=>e.code===`parentCycle`)?(0,i.jsxs)(`div`,{role:`alert`,"data-testid":`cycle-warning-banner`,className:`flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800`,children:[(0,i.jsx)(`span`,{"aria-hidden":`true`,children:`⚠`}),(0,i.jsxs)(`span`,{children:[`親タスクが循環しています。`,(0,i.jsx)(`code`,{children:`parent:`}),` を見直してください。`]})]}):null};try{a.displayName=`CycleWarningBanner`,a.__docgenInfo={description:'DetailScreen ヘッダー直下に表示する循環警告バナー。\n`task.warnings` に `parentCycle` を含むときのみ描画し、ユーザーに\n親タスクの循環を通知する。dismiss 不可で `role="alert"` を持つ。',displayName:`CycleWarningBanner`,filePath:`/home/runner/work/spec-board/spec-board/src/features/detail/components/CycleWarningBanner/index.tsx`,methods:[],props:{task:{defaultValue:null,declarations:[{fileName:`spec-board/src/features/detail/components/CycleWarningBanner/index.tsx`,name:`TypeLiteral`}],description:`表示対象タスク`,name:`task`,required:!0,tags:{},type:{name:`Task`}}},tags:{param:`props - {@link CycleWarningBannerProps }`,returns:"循環警告バナー要素、または `null`"}}}catch{}})),s,c,l,u,d,f;e((()=>{n(),o(),s={id:`task-1`,title:`サンプル`,status:`Todo`,labels:[],links:[],children:[],reverseLinks:[],body:``,filePath:`tasks/sample.md`,extras:{},warnings:[]},c={title:`features/detail/CycleWarningBanner`,component:a},l={args:{task:r.fromPayload({...s,warnings:[{code:`parentCycle`,field:`parent`,message:`parent chain forms a cycle`}]})}},u={args:{task:r.fromPayload(s)}},d={args:{task:r.fromPayload({...s,warnings:[{code:`parentCycle`,field:`parent`,message:`parent chain forms a cycle`},{code:`parentNotFound`,field:`parent`,message:`parent task was not found`}]})}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    task: Task.fromPayload({
      ...basePayload,
      warnings: [{
        code: "parentCycle",
        field: "parent",
        message: "parent chain forms a cycle"
      }]
    })
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    task: Task.fromPayload(basePayload)
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    task: Task.fromPayload({
      ...basePayload,
      warnings: [{
        code: "parentCycle",
        field: "parent",
        message: "parent chain forms a cycle"
      }, {
        code: "parentNotFound",
        field: "parent",
        message: "parent task was not found"
      }]
    })
  }
}`,...d.parameters?.docs?.source}}},f=[`Default`,`NoWarning`,`MultipleWarnings`]}))();export{l as Default,d as MultipleWarnings,u as NoWarning,f as __namedExportsOrder,c as default};