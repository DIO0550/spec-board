import{a as e,n as t}from"./chunk-BneVvdWh.js";import{t as n}from"./iframe-D1ty2vz7.js";import{t as r}from"./jsx-runtime-Bn1Ys6_W.js";import{a as i,i as a,n as o,r as s,t as c}from"./ToastProvider-Di9XK-oM.js";var l,u,d,f,p,m,h,g,_,v,y,b,x;t((()=>{l=e(n(),1),o(),a(),u=r(),d=1e3*60*60,f=e=>(0,u.jsx)(c,{defaultDurationMs:d,children:(0,u.jsx)(e,{})}),p=({items:e})=>{let{showToast:t}=i(),n=(0,l.useRef)(!1);return(0,l.useEffect)(()=>{if(!n.current){n.current=!0;for(let n of e)t(n.message,n.type)}},[e,t]),null},m={component:s,parameters:{layout:`fullscreen`},decorators:[f]},h={render:()=>(0,u.jsx)(p,{items:[]})},g={render:()=>(0,u.jsx)(p,{items:[{message:`保存しました`,type:`success`}]})},_={render:()=>(0,u.jsx)(p,{items:[{message:`保存しました`,type:`success`},{message:`通信に失敗しました`,type:`error`},{message:`下書きが残っています`,type:`warning`}]})},v={...g},y={..._},b={...h},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  render: () => <SeedToasts items={[]} />
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  render: () => <SeedToasts items={[{
    message: "保存しました",
    type: "success"
  }]} />
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  render: () => <SeedToasts items={[{
    message: "保存しました",
    type: "success"
  }, {
    message: "通信に失敗しました",
    type: "error"
  }, {
    message: "下書きが残っています",
    type: "warning"
  }]} />
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  ...Single
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  ...Multiple
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  ...Empty
}`,...b.parameters?.docs?.source}}},x=[`Empty`,`Single`,`Multiple`,`Default`,`AllProps`,`EdgeCases`]}))();export{y as AllProps,v as Default,b as EdgeCases,h as Empty,_ as Multiple,g as Single,x as __namedExportsOrder,m as default};