import{n as e}from"./chunk-BneVvdWh.js";import{t}from"./jsx-runtime-Bn1Ys6_W.js";import{n,t as r}from"./TreeNodeItem-TnI4UtKv.js";import{i,n as a}from"./test-fixtures-B9hSMIvn.js";import{n as o,t as s}from"./taskFixtures-gXBuHYrC.js";var c,l,u,d,f,p,m,h,g,_,v,y,b,x;e((()=>{s(),a(),n(),c=t(),{fn:l}=__STORYBOOK_MODULE_TEST__,u=i[0],d=i[2],f={filePath:u.filePath,children:[{filePath:d.filePath,children:[]}]},p=new Map(i.map(e=>[e.filePath,e])),m={component:r,args:{node:f,depth:0,tasksByFilePath:p,onSelect:l()},decorators:[e=>(0,c.jsx)(`ul`,{children:(0,c.jsx)(e,{})})]},h={},g={args:{depth:2}},_={args:{node:{filePath:o(`missing.md`),children:[]},tasksByFilePath:new Map}},v={args:{expanded:!0}},y={args:{expanded:!1}},b={args:{node:{filePath:i[3].filePath,children:[]},tasksByFilePath:p}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    depth: 2
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    node: {
      filePath: taskFilePathFixture("missing.md"),
      children: []
    },
    tasksByFilePath: new Map()
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    expanded: true
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    expanded: false
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    node: {
      filePath: initialTasks[3].filePath,
      children: []
    },
    tasksByFilePath
  }
}`,...b.parameters?.docs?.source}}},x=[`Default`,`AllProps`,`EdgeCases`,`Expanded`,`Collapsed`,`Done`]}))();export{g as AllProps,y as Collapsed,h as Default,b as Done,_ as EdgeCases,v as Expanded,x as __namedExportsOrder,m as default};