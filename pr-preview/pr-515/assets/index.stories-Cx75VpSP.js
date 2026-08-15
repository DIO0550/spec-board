import{a as e,n as t}from"./chunk-BneVvdWh.js";import{t as n}from"./iframe-BRKthBJg.js";import{n as r,t as i}from"./ColumnNameInput-DWTAt02P.js";var a,o,s,c,l,u,d,f;t((()=>{a=e(n(),1),r(),{fn:o}=__STORYBOOK_MODULE_TEST__,s={ref:(0,a.createRef)(),value:`Todo`,onChange:o(),onKeyDown:o(),onBlur:o(),disabled:!1,"aria-label":`カラム名`,"aria-invalid":!1,"aria-describedby":void 0},c={component:i,args:{field:{getInputProps:()=>s,isDuplicate:!1,errorId:`column-name-error`},className:`rounded border border-border px-2 py-1 text-sm`,dataTestId:`column-name-story`}},l={},u={args:{placeholder:`カラム名`,dndDisabled:!0}},d={args:{field:{getInputProps:()=>({...s,value:`Todo`}),isDuplicate:!0,errorId:`duplicate-column-error`}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    placeholder: "カラム名",
    dndDisabled: true
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    field: {
      getInputProps: () => ({
        ...inputProps,
        value: "Todo"
      }),
      isDuplicate: true,
      errorId: "duplicate-column-error"
    }
  }
}`,...d.parameters?.docs?.source}}},f=[`Default`,`AllProps`,`EdgeCases`]}))();export{u as AllProps,l as Default,d as EdgeCases,f as __namedExportsOrder,c as default};