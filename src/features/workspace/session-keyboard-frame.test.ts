// @vitest-environment happy-dom
import { act, createElement, useContext } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const f=vi.hoisted(()=>({keyboard:0,frame:undefined as undefined|((e:any)=>void),space:null as number|null}));
vi.mock("@/ui/theme",()=>({useMobileTheme:()=>undefined}));
vi.mock("react-native",()=>({View:({children,onLayout}:any)=>{if(onLayout)f.frame=onLayout;return createElement("div",null,children);}}));
vi.mock("react-native-safe-area-context",()=>({useSafeAreaInsets:()=>({left:0,right:0,bottom:0,top:0})}));
vi.mock("react-native-keyboard-controller",()=>({KeyboardStickyView:({children}:any)=>createElement("div",null,children),useKeyboardState:(select:any)=>select({height:f.keyboard}),useReanimatedKeyboardAnimation:()=>({height:{value:-f.keyboard},progress:{value:0}})}));
vi.mock("react-native-reanimated",()=>({default:{View:({children}:any)=>createElement("div",null,children)},useSharedValue:(value:any)=>({value}),useAnimatedStyle:(read:any)=>read()}));
import {SessionKeyboardFrame,SessionKeyboardSpace} from "./session-keyboard-frame";
it("retains measured available space and the same composer across hidden zero layouts and keyboard updates",()=>{
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);const host=document.createElement("div"),root=createRoot(host);function Composer(){f.space=useContext(SessionKeyboardSpace);return createElement("input",{defaultValue:"Draft"});}const render=()=>act(()=>root.render(createElement(SessionKeyboardFrame,{composer:createElement(Composer)},"Transcript")));
 try{render();act(()=>f.frame!({nativeEvent:{layout:{height:300}}}));expect(f.space).toBe(300);const input=host.querySelector("input");for(const height of [0,-1,NaN,Infinity])act(()=>f.frame!({nativeEvent:{layout:{height}}}));expect(f.space).toBe(300);f.keyboard=100;render();expect(f.space).toBe(200);expect(host.querySelector("input")).toBe(input);}
 finally{act(()=>root.unmount());vi.unstubAllGlobals();}
});
