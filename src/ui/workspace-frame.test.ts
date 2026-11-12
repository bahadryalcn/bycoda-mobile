// @vitest-environment jsdom
import {act,createElement,useState,type PropsWithChildren} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,expect,it,vi} from "vitest";
const f=vi.hoisted(()=>({scale:1,frame:undefined as undefined|((e:any)=>void),toolbar:undefined as undefined|((e:any)=>void),maximum:0,insets:{left:0,right:0},padding:{start:0,end:0}}));
vi.mock("react-native-safe-area-context",()=>({useSafeAreaInsets:()=>f.insets}));
vi.mock("react-native",()=>({useWindowDimensions:()=>({fontScale:f.scale}),View:({children,onLayout,style}:PropsWithChildren<{onLayout?:(e:any)=>void;style:any}>)=>{if(onLayout){if(style.flex===1)f.frame=onLayout;else f.toolbar=onLayout;}return createElement("div",null,children);},ScrollView:({children,style,contentContainerStyle}:PropsWithChildren<{style:any;contentContainerStyle:any}>)=>{f.padding={start:contentContainerStyle.paddingStart,end:contentContainerStyle.paddingEnd};f.maximum=style.maxHeight;return createElement("section",null,children);}}));
import {WorkspaceFrame} from "./workspace-frame";
let root:ReturnType<typeof createRoot>|undefined;
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;f.scale=1;f.insets={left:0,right:0};vi.unstubAllGlobals();});
it("retains the same workspace child while header feedback and measured layout grow",async()=>{
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);const container=document.createElement("div");root=createRoot(container);
 function Draft(){const[value]=useState("Retained editor draft");return createElement("input",{value,readOnly:true});}
 const render=(feedback?:string)=>act(async()=>root!.render(createElement(WorkspaceFrame,{toolbar:"Navigation",feedback},createElement(Draft))));
 await render();const original=container.querySelector("input");await act(async()=>{f.frame!({nativeEvent:{layout:{height:230}}});});expect(f.maximum).toBe(126);f.insets={left:24,right:32};await render("Long feedback ".repeat(100));expect(f.padding).toEqual({start:24,end:32});expect(container.querySelector("input")).toBe(original);f.scale=2;await render("Still present");expect(f.maximum).toBeLessThanOrEqual(115);expect(original!.value).toBe("Retained editor draft");
});
it("ignores transient zero layouts while a private region hides and returns",async()=>{
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);root=createRoot(document.createElement("div"));await act(async()=>root!.render(createElement(WorkspaceFrame,{toolbar:"Navigation"},"Body")));await act(async()=>{f.frame!({nativeEvent:{layout:{height:230}}});});for(const height of [0,-1,NaN])await act(async()=>f.frame!({nativeEvent:{layout:{height}}}));expect(f.maximum).toBe(126);
});

it("retains an embedded child while its existing gutter owner takes over",async()=>{
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);const container=document.createElement("div");root=createRoot(container);f.insets={left:24,right:32};
 await act(async()=>root!.render(createElement(WorkspaceFrame,{toolbar:"Navigation"},createElement("input",{defaultValue:"Draft"}))));const input=container.querySelector("input");
 await act(async()=>root!.render(createElement(WorkspaceFrame,{toolbar:"Navigation",headerInset:"none"},createElement("input",{defaultValue:"Draft"}))));expect(f.padding).toEqual({start:0,end:0});expect(container.querySelector("input")).toBe(input);
});
