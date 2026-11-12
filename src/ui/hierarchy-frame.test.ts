// @vitest-environment jsdom
import {act,createElement,useState,type PropsWithChildren} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,expect,it,vi} from "vitest";
const f=vi.hoisted(()=>({scale:1,measure:undefined as undefined|((e:any)=>void),layout:{indent:0,compressed:false}}));
vi.mock("react-native",()=>({useWindowDimensions:()=>({fontScale:f.scale}),View:({children,onLayout}:PropsWithChildren<{onLayout:(e:any)=>void}>)=>{f.measure=onLayout;return createElement("div",null,children);}}));
vi.mock("./tokens",()=>({fontSize:{title:17},space:{md:12}}));
import {HierarchyFrame,HierarchyWidthProvider} from "./hierarchy-frame";
let root:ReturnType<typeof createRoot>|undefined;
const measure=(width:number)=>act(async()=>f.measure!({nativeEvent:{layout:{width}}}));
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;f.scale=1;vi.unstubAllGlobals();});
it("changes indentation without remounting or discarding the child draft",async()=>{
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);const container=document.createElement("div");root=createRoot(container);
 function Draft(){const[value,setValue]=useState("Retained draft");return createElement("input",{value,onChange:(e:any)=>setValue(e.target.value)});}
 const render=()=>act(async()=>root!.render(createElement(HierarchyFrame,{depth:4,reservedWidth:73,children:layout=>{f.layout=layout;return createElement(Draft);}})));
 await render();expect(f.layout.indent).toBe(0);const original=container.querySelector("input");await measure(600);expect(f.layout.indent).toBe(48);await measure(216);expect(f.layout.indent).toBe(7);f.scale=2;await render();expect(f.layout.indent).toBe(0);expect(container.querySelector("input")).toBe(original);expect(original!.value).toBe("Retained draft");
});
it("ignores transient zero and non-finite native measurements",async()=>{
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);root=createRoot(document.createElement("div"));await act(async()=>root!.render(createElement(HierarchyFrame,{depth:4,reservedWidth:73,children:layout=>{f.layout=layout;return null;}})));await measure(600);for(const value of [0,-1,NaN,Infinity])await measure(value);expect(f.layout).toEqual({indent:48,compressed:false});
});
it("lets rows mounted after the first measurement lay out at their final indent immediately",async()=>{
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);root=createRoot(document.createElement("div"));
 const seen:number[]=[];
 const row=(key:string)=>createElement(HierarchyFrame,{key,depth:4,reservedWidth:73,children:layout=>{if(key==="late")seen.push(layout.indent);return null;}});
 const tree=(rows:string[])=>createElement(HierarchyWidthProvider,null,...rows.map(row));
 await act(async()=>root!.render(tree(["first"])));await measure(600);
 await act(async()=>root!.render(tree(["first","late"])));
 expect(seen).toEqual([48]);
});
