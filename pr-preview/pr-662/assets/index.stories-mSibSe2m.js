import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,t as r}from"./StatusColumnTable-BmxOQSL-.js";var i,a,o,s,c,l,u,d;e((()=>{n(),i=t(),{fn:a}=__STORYBOOK_MODULE_TEST__,o=[{id:`todo`,name:`Todo`,taskCount:4,color:`#466abf`,wipLimit:5},{id:`done`,name:`Done`,taskCount:0,color:`#14874e`}],s={component:r,args:{columns:o,doneColumn:`Done`,onNameChange:a(),onWipLimitChange:a(),onMove:a(),onDoneChange:a(),onDelete:a()},decorators:[e=>(0,i.jsx)(`div`,{className:`max-w-[900px] p-6`,children:(0,i.jsx)(e,{})})]},c={},l={args:{columns:[...o,{id:`blocked`,name:`Blocked`,taskCount:0,color:`#d55753`}]}},u={args:{columns:[{id:`only`,name:`Only column`,taskCount:0,color:`#79818d`}],doneColumn:`Only column`}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    columns: [...columns, {
      id: "blocked",
      name: "Blocked",
      taskCount: 0,
      color: "#d55753"
    }]
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    columns: [{
      id: "only",
      name: "Only column",
      taskCount: 0,
      color: "#79818d"
    }],
    doneColumn: "Only column"
  }
}`,...u.parameters?.docs?.source}}},d=[`Default`,`AllProps`,`EdgeCases`]}))();export{l as AllProps,c as Default,u as EdgeCases,d as __namedExportsOrder,s as default};