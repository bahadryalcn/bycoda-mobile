// @vitest-environment happy-dom
import { act, createElement, useContext } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const f=vi.hoisted(()=>({keyboard:0,frame:undefined as undefined|((e:any)=>void),composerLayout:undefined as undefined|((e:any)=>void),composerViewport:undefined as undefined|((e:any)=>void),space:null as number|null, scrollTo:vi.fn(), focusedInput:null as null | {measureLayout:ReturnType<typeof vi.fn>}}));
vi.mock("@/ui/theme",()=>({useMobileTheme:() => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} })}));
vi.mock("react-native",()=>({
 Platform:{OS:"ios"},
 View:({children,onLayout}:any)=>{if(onLayout)f.frame=onLayout;return createElement("div",null,children);},
 ScrollView:({children,onLayout,keyboardShouldPersistTaps,ref}:any)=>{
   f.composerViewport=onLayout;
   return createElement("section",{ref:()=>{ref.current={getInnerViewRef:()=>({}),scrollTo:f.scrollTo};},"data-composer-scroll":true,"data-persist-taps":keyboardShouldPersistTaps},children);
 },
 TextInput:{State:{currentlyFocusedInput:()=>f.focusedInput}},
}));
vi.mock("@/ui/adaptive-layout",()=>({useAdaptiveLayout:()=>({tabletop:null})}));
vi.mock("react-native-safe-area-context",()=>({useSafeAreaInsets:()=>({left:0,right:0,bottom:0,top:0})}));
vi.mock("react-native-keyboard-controller",()=>({useKeyboardState:(select:any)=>select({height:f.keyboard}),useReanimatedKeyboardAnimation:()=>({height:{value:-f.keyboard},progress:{value:0}})}));
vi.mock("react-native-reanimated",()=>({default:{View:({children,onLayout,style}:any)=>{if(onLayout)f.composerLayout=onLayout;return createElement("div",{"data-band-height":style?.find((part:any)=>part?.maxHeight!==undefined)?.maxHeight},children);}},useAnimatedStyle:(read:any)=>read()}));
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
it("keeps the focused composer and its controls within a very short IME frame", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host);
  const onSend = vi.fn();
  const render = () => act(() => root.render(createElement(SessionKeyboardFrame, {
    composer: createElement("div", null, createElement("input", { defaultValue: "Draft" }),
      createElement("button", { onClick: onSend }, "Send")),
  }, "Transcript")));
  f.keyboard = 0;
  f.scrollTo.mockClear();
  try {
    render();
    act(() => f.frame!({ nativeEvent: { layout: { height: 400 } } }));
    const input = host.querySelector("input");
    expect(host.querySelector('[data-composer-scroll="true"]')).not.toBeNull();
    f.keyboard = 336;
    f.focusedInput = { measureLayout: vi.fn((_container, success) => success(0, 52, 120, 48)) };
    render();
    act(() => f.composerViewport!({ nativeEvent: { layout: { height: 52 } } }));

    const boundedBand = host.querySelector('[data-band-height="64"]');
    expect(boundedBand?.querySelector('[data-persist-taps="always"] input')).toBe(input);
    expect(f.scrollTo).toHaveBeenLastCalledWith({ y: 48, animated: false });
    act(() => boundedBand?.querySelector("button")?.click());
    expect(onSend).toHaveBeenCalledOnce();

    f.keyboard = 0;
    render();
    expect(host.querySelector("input")).toBe(input);
    expect(host.querySelector("[data-band-height]")).toBeNull();
    expect(f.scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: false });
  } finally {
    f.keyboard = 0;
    f.focusedInput = null;
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
