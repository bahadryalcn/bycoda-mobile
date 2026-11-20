// @vitest-environment happy-dom
import { act, createElement, useContext } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const f=vi.hoisted(()=>({keyboard:0,frame:undefined as undefined|((e:any)=>void),composerLayout:undefined as undefined|((e:any)=>void),space:null as number|null}));
vi.mock("@/ui/theme",()=>({useMobileTheme:() => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} })}));
vi.mock("react-native",()=>({View:({children,onLayout}:any)=>{if(onLayout)f.frame=onLayout;return createElement("div",null,children);}}));
vi.mock("@/ui/adaptive-layout",()=>({useAdaptiveLayout:()=>({tabletop:null})}));
vi.mock("react-native-safe-area-context",()=>({useSafeAreaInsets:()=>({left:0,right:0,bottom:0,top:0})}));
vi.mock("react-native-keyboard-controller",()=>({useKeyboardState:(select:any)=>select({height:f.keyboard}),useReanimatedKeyboardAnimation:()=>({height:{value:-f.keyboard},progress:{value:0}})}));
vi.mock("react-native-reanimated",()=>({default:{View:({children,onLayout}:any)=>{if(onLayout)f.composerLayout=onLayout;return createElement("div",null,children);}},useAnimatedStyle:(read:any)=>read()}));
import {SessionComposerHeightProvider,SessionKeyboardFrame,SessionKeyboardSpace} from "./session-keyboard-frame";
it("retains measured available space and the same composer across hidden zero layouts and keyboard updates",()=>{
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);const host=document.createElement("div"),root=createRoot(host);function Composer(){f.space=useContext(SessionKeyboardSpace);return createElement("input",{defaultValue:"Draft"});}const render=()=>act(()=>root.render(createElement(SessionKeyboardFrame,{composer:createElement(Composer)},"Transcript")));
 try{render();act(()=>f.frame!({nativeEvent:{layout:{height:300}}}));expect(f.space).toBe(300);const input=host.querySelector("input");for(const height of [0,-1,NaN,Infinity])act(()=>f.frame!({nativeEvent:{layout:{height}}}));expect(f.space).toBe(300);f.keyboard=100;render();expect(f.space).toBe(200);expect(host.querySelector("input")).toBe(input);}
 finally{act(()=>root.unmount());vi.unstubAllGlobals();}
});
it("reports the measured composer band height to the quick-panel overlay, falling back until measured",()=>{
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);const host=document.createElement("div"),root=createRoot(host);const insets:number[]=[];
 const render=()=>act(()=>root.render(createElement(SessionComposerHeightProvider,{fallback:34,overlay:(bottomInset:number)=>{insets.push(bottomInset);return null;}},createElement(SessionKeyboardFrame,{composer:createElement("input")},"Transcript"))));
 try{render();expect(insets.at(-1)).toBe(34);act(()=>f.composerLayout!({nativeEvent:{layout:{height:0}}}));expect(insets.at(-1)).toBe(34);act(()=>f.composerLayout!({nativeEvent:{layout:{height:96}}}));expect(insets.at(-1)).toBe(96);act(()=>f.composerLayout!({nativeEvent:{layout:{height:150}}}));expect(insets.at(-1)).toBe(150);}
 finally{act(()=>root.unmount());vi.unstubAllGlobals();}
});
