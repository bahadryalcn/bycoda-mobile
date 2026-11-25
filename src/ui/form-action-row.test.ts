// @vitest-environment happy-dom
import { act, createElement, createRef, Fragment, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import type { HostInstance } from "react-native";
import { afterEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({measure:null as null|((event:any)=>void),keyboard:false}));
vi.mock("react-native",()=>({
 View:({children,onLayout,style}:PropsWithChildren<{onLayout?:(event:any)=>void;style?:any}>)=>{
  if(onLayout)state.measure=onLayout;
  return createElement("div",{style},children);
 },
 ScrollView:({children,style}:PropsWithChildren<{style?:any}>)=>createElement("div",{style,"data-feedback-scroll":true},children),
 useWindowDimensions:()=>({height:400}),
}));
vi.mock("./theme",()=>({useMobileTheme:()=>({semanticColors:{warning:{text:"warning"}}})}));
vi.mock("react-native-keyboard-controller",()=>({useKeyboardState:(select:(state:{isVisible:boolean})=>boolean)=>select({isVisible:state.keyboard})}));
vi.mock("./copy",()=>({useCopy:()=> (_tr:string,en:string)=>en}));
vi.mock("./unsaved-badge",()=>({UnsavedBadge:()=>createElement("i",null,"Unsaved changes")}));
vi.mock("./buttons",()=>({Button:({label,onPress,busy,disabled,ref}:any)=>createElement("button",{ref,onClick:onPress,disabled:busy||disabled},label)}));
import { FormActionRow } from "./form-action-row";
import { FormActionScrollOwner } from "./form-action-context";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:ReturnType<typeof createRoot>|undefined;
afterEach(()=>{act(()=>root?.unmount());root=undefined;document.body.replaceChildren();state.measure=null;state.keyboard=false;});
function mount(props:any){const host=document.createElement("div");document.body.append(host);root=createRoot(host);act(()=>root!.render(createElement(FormActionRow,props)));return host;}
it("puts sheet operations before long feedback and leaves standalone feedback before operations",()=>{
 const props={submitLabel:"Save",onSubmit:vi.fn(),feedback:createElement("span",null,"Long operation failure")};
 const host=mount({...props,feedbackPlacement:"after",scrollFeedback:false});
 expect(host.textContent).toBe("SaveLong operation failure");
 act(()=>root!.render(createElement(FormActionRow,props)));
 expect(host.textContent).toBe("Long operation failureSave");
});
it("puts the disabled-save reason above the sheet actions", () => {
  const host = mount({
    disabled: true, submitLabel: "Save", onSubmit: vi.fn(), onCancel: vi.fn(),
    feedback: createElement("span", null, "Choose a computer"), feedbackPlacement: "after",
  });
  expect(host.textContent).toBe("Choose a computerSaveCancel");
  expect(host.querySelector("button")?.disabled).toBe(true);
});
it("preserves the action node, focus and current callbacks when feedback changes",()=>{
 const first=vi.fn(),latest=vi.fn(),cancel=vi.fn();
 const submitRef=createRef<HostInstance>();
 const props={submitLabel:"Save",submitRef,onSubmit:first,onCancel:cancel,feedbackPlacement:"after" as const,scrollFeedback:false};
 const host=mount({...props,feedback:createElement("span",null,"Failure")});
 const button=host.querySelector("button")!;button.focus();
 act(()=>root!.render(createElement(FormActionRow,{...props,onSubmit:latest,feedback:createElement(Fragment)})));
 expect(host.querySelector("button")).toBe(button);expect(document.activeElement).toBe(button);
 expect(submitRef.current).toBe(button);
 act(()=>button.click());expect(latest).toHaveBeenCalledOnce();expect(first).not.toHaveBeenCalled();
 act(()=>root!.render(createElement(FormActionRow,{...props,busy:true})));
 expect([...host.querySelectorAll("button")].every(button=>button.disabled)).toBe(true);
 act(()=>button.click());expect(first).not.toHaveBeenCalled();expect(cancel).not.toHaveBeenCalled();
});
it("adds spacing only for rendered feedback and removes it when a fragment becomes empty",()=>{
 const host=mount({submitLabel:"Save",onSubmit:vi.fn(),feedback:createElement("span",{id:"feedback"},"Failure"),feedbackPlacement:"after",scrollFeedback:false});
 const region=()=>host.querySelector("#feedback")!.parentElement!.parentElement!;
 expect(region().style.marginTop).toBe("0px");
 act(()=>state.measure?.({nativeEvent:{layout:{height:22}}}));expect(region().style.marginTop).toBe("6px");
 act(()=>state.measure?.({nativeEvent:{layout:{height:0}}}));expect(region().style.marginTop).toBe("0px");
});

it("uses the surrounding action scroller without nesting another feedback viewport",()=>{
 const host=document.createElement("div");document.body.append(host);root=createRoot(host);
 act(()=>root!.render(createElement(FormActionScrollOwner,{value:true},createElement(FormActionRow,{submitLabel:"Save",onSubmit:vi.fn(),feedback:createElement("span",null,"Failure")}))));
 expect(host.textContent).toBe("SaveFailure");
 expect(host.querySelector("[data-feedback-scroll]")).toBeNull();
});
it("allows explicit read-only close while busy and retains an explicit cancel guard",()=>{
 const close=vi.fn(),props={submitLabel:"Retry",onSubmit:vi.fn(),onCancel:close,cancelLabel:"Close",busy:true,allowCancelWhileBusy:true};
 const host=mount(props),buttons=host.querySelectorAll("button");
 expect(buttons[0].disabled).toBe(true);expect(buttons[1].disabled).toBe(false);
 act(()=>buttons[1].click());expect(close).toHaveBeenCalledOnce();
 act(()=>root!.render(createElement(FormActionRow,{...props,cancelDisabled:true})));
 expect([...host.querySelectorAll("button")].every(button=>button.disabled)).toBe(true);
});
it("shows the unsaved pill above the actions only while dirty",()=>{
 const props={submitLabel:"Save",onSubmit:vi.fn()};
 const host=mount(props);expect(host.textContent).toBe("Save");
 act(()=>root!.render(createElement(FormActionRow,{...props,dirty:true})));
 expect(host.textContent).toBe("Unsaved changesSave");
});

it("puts Cancel and the primary action on one row while the keyboard is open, keeping the same submit node",()=>{
 const host=mount({submitLabel:"Save",onSubmit:vi.fn(),onCancel:vi.fn(),dirty:true});
 const submit=host.querySelector("button")!;
 expect(host.textContent).toContain("Unsaved changes");
 state.keyboard=true;
 act(()=>root!.render(createElement(FormActionRow,{submitLabel:"Save",onSubmit:vi.fn(),onCancel:vi.fn(),dirty:true})));
 expect(host.querySelector("button")).toBe(submit);
 expect(host.textContent).not.toContain("Unsaved changes");
 expect((submit.parentElement as HTMLElement).style.flexDirection).toBe("row-reverse");
});
