// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture=vi.hoisted(()=>({code:vi.fn(),cancel:vi.fn(),submit:null as null|(()=>void),clipboard:""}));
vi.mock("expo-clipboard",()=>({hasStringAsync:async()=>!!fixture.clipboard,getStringAsync:async()=>fixture.clipboard}));
vi.mock("./pairing-code",()=>({parseMobilePairingCode:(value:string)=>{if(!value.startsWith("valid-"))throw new Error("invalid");return {};}}));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/copy",()=>({useCopy:()=> (_tr:string,en:string)=>en}));
vi.mock("@/ui/info-hint", () => ({ HintLabel: ({label}: {label: string}) => createElement("h2", null, label) }));
vi.mock("@/ui/motion",()=>({enterItem:()=>undefined}));
vi.mock("@/ui/tokens",()=>({space:{}}));vi.mock("@/ui/styles",()=>({uiStyles:{}}));
vi.mock("react-native",()=>({Text:({children}:PropsWithChildren)=>createElement("p",null,children),View:({children}:PropsWithChildren)=>createElement("div",null,children)}));
vi.mock("react-native-reanimated",()=>({default:{View:({children}:PropsWithChildren)=>createElement("div",null,children)}}));
vi.mock("@/ui/primitives",()=>({
 Body:({children}:PropsWithChildren)=>createElement("p",null,children),
 Heading:({children}:PropsWithChildren)=>createElement("h2",null,children),
 IdentifierField:({value,onChangeText,editable}:{value:string;onChangeText:(value:string)=>void;editable:boolean})=>createElement("textarea",{value,disabled:!editable,onChange:event=>onChangeText((event.currentTarget as HTMLTextAreaElement).value)}),
 MutationState:({mutation}:{mutation:{error?:Error}})=>mutation.error?createElement("p",null,mutation.error.message):null,
 FormActions:({onSubmit,onCancel,disabled,submitLabel,cancelLabel,feedback}:{onSubmit:()=>void;onCancel:()=>void;disabled:boolean;submitLabel:string;cancelLabel:string;feedback:import("react").ReactNode})=>{fixture.submit=onSubmit;return createElement("div",null,feedback,createElement("button",{onClick:onSubmit,disabled},submitLabel),createElement("button",{onClick:onCancel},cancelLabel));},
}));
import { PairingPaste } from "./pairing-paste";
let root:ReturnType<typeof createRoot>|undefined,container:HTMLDivElement,client:QueryClient;
const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
const click=(label:string)=>[...container.querySelectorAll("button")].find(button=>button.textContent===label)!.click();
async function fill(value:string){await act(async()=>{const input=container.querySelector("textarea")!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));});}
beforeEach(async()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);container=document.createElement("div");document.body.append(container);root=createRoot(container);client=new QueryClient();fixture.code.mockRejectedValue(new Error("Synthetic invalid code"));await act(async()=>root!.render(createElement(QueryClientProvider,{client},createElement(PairingPaste,{disabled:false,onCode:fixture.code,onCancel:fixture.cancel}))));});
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;container.remove();client.clear();vi.resetAllMocks();vi.unstubAllGlobals();fixture.clipboard="";});
async function remount(clipboard:string){await act(async()=>root!.unmount());fixture.clipboard=clipboard;root=createRoot(container);await act(async()=>root!.render(createElement(QueryClientProvider,{client},createElement(PairingPaste,{disabled:false,onCode:fixture.code,onCancel:fixture.cancel}))));await settle();}
it("fills the empty field from a copied valid pairing code",async()=>{
 await remount(" valid-code ");expect(container.querySelector("textarea")!.value).toBe("valid-code");expect(fixture.code).not.toHaveBeenCalled();
});
it("leaves the field empty when the copied text is not a pairing code",async()=>{
 await remount("hello");expect(container.querySelector("textarea")!.value).toBe("");
});
it("retains invalid input for correction and clears stale validation feedback when edited",async()=>{
 await fill("synthetic-code-one");await act(async()=>click("Preview computer"));await settle();expect(container.textContent).toContain("Synthetic invalid code");expect(container.querySelector("textarea")!.value).toBe("synthetic-code-one");
 await fill("synthetic-code-two");await settle();expect(container.textContent).not.toContain("Synthetic invalid code");
 await act(async()=>click("Preview computer"));await settle();expect(fixture.code).toHaveBeenLastCalledWith("synthetic-code-two");
});
it("does not invoke a queued validation after its editor is canceled",async()=>{
 await fill("synthetic-code");await act(async()=>{click("Preview computer");click("Cancel");});await settle();expect(fixture.cancel).toHaveBeenCalledTimes(1);expect(fixture.code).not.toHaveBeenCalled();
});
it("rejects a previously captured submit callback after unmount",async()=>{
 await fill("synthetic-code");const submit=fixture.submit!;await act(async()=>root!.unmount());root=undefined;await act(async()=>submit());await settle();expect(fixture.code).not.toHaveBeenCalled();
});
