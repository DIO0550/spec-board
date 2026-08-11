import{a as e,n as t}from"./chunk-BneVvdWh.js";import{t as n}from"./iframe-txW9JNM0.js";import{t as r}from"./jsx-runtime-B6lWK8m9.js";import{a as i,i as a,n as o,r as s,t as c}from"./ToastProvider-ClO6OcCo.js";var l,u,d,f,p,m,h,g,_,v;t((()=>{l=e(n(),1),o(),a(),u=r(),d=1e3*60*60,f=e=>(0,u.jsx)(c,{defaultDurationMs:d,children:(0,u.jsx)(e,{})}),p=({items:e})=>{let{showToast:t}=i(),n=(0,l.useRef)(!1);return(0,l.useEffect)(()=>{if(!n.current){n.current=!0;for(let n of e)t(n.message,n.type)}},[e,t]),null},m={component:s,parameters:{layout:`fullscreen`},decorators:[f]},h={render:()=>(0,u.jsx)(p,{items:[]})},g={render:()=>(0,u.jsx)(p,{items:[{message:`保存しました`,type:`success`}]})},_={render:()=>(0,u.jsx)(p,{items:[{message:`保存しました`,type:`success`},{message:`通信に失敗しました`,type:`error`},{message:`下書きが残っています`,type:`warning`}]})},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
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
}`,..._.parameters?.docs?.source}}},v=[`Empty`,`Single`,`Multiple`]}))();export{h as Empty,_ as Multiple,g as Single,v as __namedExportsOrder,m as default};