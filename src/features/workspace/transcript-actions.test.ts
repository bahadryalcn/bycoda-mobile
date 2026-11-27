// @vitest-environment jsdom
import { act,createElement,type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
const f=vi.hoisted(()=>({clipboard:vi.fn(),share:vi.fn(),request:vi.fn(),report:vi.fn(),route:vi.fn(),close:vi.fn(),nextClose:vi.fn(),ids:0,rows:[] as {label:string;press:()=>void}[],allowed:true,state:{appState:"active",windowFocused:true},listeners:new Set<()=>void>()}));
vi.mock("react-native",()=>({View:({children,...props}:PropsWithChildren<{ref?:unknown}>)=>createElement("div",{ref:props.ref as any},children),Share:{share:f.share},findNodeHandle:()=>73}));
vi.mock("expo-clipboard",()=>({setStringAsync:f.clipboard}));vi.mock("expo-crypto",()=>({randomUUID:()=>"note-"+(++f.ids)}));vi.mock("expo-router",()=>({router:{push:f.route}}));
vi.mock("@/remote/transport",async()=>({RemoteHostError:(await import("@/remote/host-error")).RemoteHostError}));
vi.mock("@/state/security",()=>({isAppAccessAllowed:()=>f.allowed,useSecurity:{getState:()=>f.state,subscribe:(fn:()=>void)=>{f.listeners.add(fn);return()=>f.listeners.delete(fn);}}}));
vi.mock("@/ui/copy",()=>({useCopy:()=> (_tr:string,en:string)=>en}));vi.mock("../reporting/report-store",()=>({startContentReport:f.report}));vi.mock("./composer-transfer",()=>({useComposerTransfer:()=>({transfer:vi.fn()})}));vi.mock("./selected-text",()=>({SelectedText:()=>createElement("p",null,"Selection open")}));
vi.mock("@/ui/primitives",()=>{const Wrapper=({children}:PropsWithChildren)=>createElement("div",null,children);const Action=({label,onPress,disabled,intent}:{label:string;onPress:()=>void;disabled?:boolean;intent?:string})=>{f.rows.push({label,press:onPress});return createElement("button",{onClick:onPress,disabled,"data-intent":intent},label);};return {Body:Wrapper,RowIcon:()=>null,NavigationGroup:Wrapper,NavigationRow:Action,Button:Action,ErrorText:({error}:{error:unknown})=>error?createElement("p",{role:"alert"},String(error)):null,Notice:({message}:{message:string})=>createElement("p",null,message), Sheet:({children,dismissible}:PropsWithChildren<{dismissible?:boolean}>)=>createElement("section",{"data-dismissible":String(dismissible)},children)};});
vi.mock("lucide-react-native/icons/copy", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/pencil", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/flag", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/notebook-pen", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/text-select", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/share-2", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/trash-2", () => ({ default: () => null }));
vi.mock("@/ui/icon-tile", () => ({ IconTile: ({ children }: PropsWithChildren) => createElement("span", null, children) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: { muted: "#888" } }) }));
import { TranscriptActions } from "./transcript-actions";
import { RemoteHostError } from "@/remote/host-error";
import type { MessageContext } from "@/ui/media-policy";
let root:ReturnType<typeof createRoot>,container:HTMLDivElement,props:Parameters<typeof TranscriptActions>[0];
const context=(endpoint="fixture://one")=>({machineId:"m",projectId:"p",sessionId:"s",cwd:"/project",client:{machine:{id:"m",endpoint,environmentId:"local"},request:f.request,assertCurrentAccess:()=>{if(!f.allowed)throw Error("Access denied");}}}) as unknown as MessageContext;
const render=()=>act(async()=>root.render(createElement(TranscriptActions,props)));
const button=(label:string)=>[...container.querySelectorAll("button")].find(b=>b.textContent===label)!;
const click=(label:string)=>act(async()=>button(label).click());
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);f.allowed=true;f.state={appState:"active",windowFocused:true};f.rows=[];f.ids=0;f.clipboard.mockReset().mockResolvedValue(undefined);f.share.mockReset().mockResolvedValue({action:"sharedAction"});f.request.mockReset().mockImplementation(async(_method:string,args:any)=>args.note);f.report.mockReset();f.route.mockReset();f.close.mockReset();f.nextClose.mockReset();container=document.createElement("div");root=createRoot(container);props={text:"# Original message",responseText:"Complete response",context:context(),reportable:true,onClose:f.close};});
afterEach(async()=>{await act(async()=>root.unmount());vi.unstubAllGlobals();vi.unstubAllEnvs();});
it("retains uncertain note recovery after an unrelated share failure",async()=>{
 f.request.mockRejectedValueOnce(new RemoteHostError("m","network","Save outcome unknown",true));f.share.mockRejectedValueOnce(new Error("Share failed"));await render();await click("Save as note");await click("Share");expect(button("Save as note").disabled).toBe(true);expect(button("Check saved note")).toBeDefined();
});
it("does not close a changed source menu when an older clipboard write finishes",async()=>{
 let done!:()=>void;f.clipboard.mockImplementationOnce(()=>new Promise<void>(resolve=>{done=resolve;}));await render();await click("Copy message");props={...props,text:"New message",onClose:f.nextClose};await render();await act(async()=>done());expect(f.close).not.toHaveBeenCalled();expect(f.nextClose).not.toHaveBeenCalled();
});
it("keeps report behind the same synchronous action gate as copy and note",async()=>{
 await render();const actions=["Copy message","Save as note","Report content"].map(label=>f.rows.find(row=>row.label===label)!.press);await act(async()=>actions.forEach(action=>action()));expect(f.clipboard).toHaveBeenCalledTimes(1);expect(f.request).not.toHaveBeenCalled();expect(f.report).not.toHaveBeenCalled();expect(f.route).not.toHaveBeenCalled();
});

it("keeps uncertain status when checking fails and reuses the original note ID",async()=>{
 f.request.mockRejectedValueOnce(new RemoteHostError("m","network","Save outcome unknown",true)).mockRejectedValueOnce(new Error("Check failed"));await render();await click("Save as note");const id=f.request.mock.calls[0][1].note.id;await click("Check saved note");expect(button("Save as note").disabled).toBe(true);expect(button("Check saved note")).toBeDefined();expect(f.request.mock.calls[1][1]).toEqual({id});
});
it("accepts a matching saved record and never replays the uncertain write",async()=>{
 f.request.mockRejectedValueOnce(new RemoteHostError("m","network","Save outcome unknown",true)).mockImplementationOnce(async(_method:string,args:any)=>({id:args.id,body:props.text}));await render();await click("Save as note");await click("Check saved note");expect(button("Saved to notes").disabled).toBe(true);expect(f.request.mock.calls.filter(call=>call[0]==="notes.upsert")).toHaveLength(1);
});
it("offers only an explicit same-ID create retry after an authoritative absent record",async()=>{
 f.request.mockRejectedValueOnce(new RemoteHostError("m","network","Save outcome unknown",true)).mockResolvedValueOnce(null);await render();await click("Save as note");const first=f.request.mock.calls[0][1];await click("Check saved note");expect(container.textContent).toContain("Note not found.");expect(f.request).toHaveBeenCalledTimes(2);await click("Save as note");expect(f.request.mock.calls[2][1].note.id).toBe(first.note.id);expect(f.request.mock.calls[2][1].expectedUpdatedAt).toBe(0);expect(f.ids).toBe(1);
});
it("does not accept a different note/body as a saved receipt",async()=>{
 f.request.mockRejectedValueOnce(new RemoteHostError("m","network","Save outcome unknown",true)).mockResolvedValueOnce({id:"other",body:"other source"});await render();await click("Save as note");await click("Check saved note");expect(button("Save as note").disabled).toBe(true);expect(container.textContent).toContain("could not be verified");
});
it("retires retained copy/share/note/report callbacks when the Host scope changes",async()=>{
 await render();const old=["Copy message","Share","Save as note","Report content"].map(label=>f.rows.find(row=>row.label===label)!.press);props={...props,context:context("fixture://two")};await render();await act(async()=>old.forEach(action=>action()));expect(f.clipboard).not.toHaveBeenCalled();expect(f.share).not.toHaveBeenCalled();expect(f.request).not.toHaveBeenCalled();expect(f.report).not.toHaveBeenCalled();
});
it("does not revive old actions after source A/B/A or private lock/return",async()=>{
 await render();const old=f.rows.find(row=>row.label==="Save as note")!.press;props={...props,text:"Other source"};await render();props={...props,text:"# Original message"};await render();await act(async()=>old());expect(f.request).not.toHaveBeenCalled();expect(button("Save as note").disabled).toBe(true);
});
it("rejects retained report and share actions across a batched lock and return",async()=>{
 await render();const old=["Share","Report content"].map(label=>f.rows.find(row=>row.label===label)!.press);await act(async()=>{f.allowed=false;f.listeners.forEach(fn=>fn());f.allowed=true;f.listeners.forEach(fn=>fn());});await act(async()=>old.forEach(action=>action()));expect(f.share).not.toHaveBeenCalled();expect(f.report).not.toHaveBeenCalled();await click("Share");expect(f.share).toHaveBeenCalledTimes(1);
});
it("retains a started note write as uncertain after lock/return and a late success",async()=>{
 let done!:(value:unknown)=>void;f.request.mockImplementationOnce(()=>new Promise(resolve=>{done=resolve;}));await render();await click("Save as note");const submitted=f.request.mock.calls[0][1].note;await act(async()=>{f.allowed=false;f.listeners.forEach(fn=>fn());f.allowed=true;f.listeners.forEach(fn=>fn());done(submitted);});expect(button("Save as note").disabled).toBe(true);expect(button("Check saved note")).toBeDefined();expect(f.request).toHaveBeenCalledTimes(1);
});
it("checks a revoked report capability at invocation and latches report navigation once",async()=>{
 await render();const old=f.rows.find(row=>row.label==="Report content")!.press;props={...props,reportable:false};await render();await act(async()=>old());expect(f.report).not.toHaveBeenCalled();props={...props,reportable:true};await render();const current=f.rows.filter(row=>row.label==="Report content").at(-1)!.press;await act(async()=>{current();current();});expect(f.report).toHaveBeenCalledExactlyOnceWith(props.text);expect(f.route).toHaveBeenCalledExactlyOnceWith("/report");
});
it("updates the complete-response copy target without replaying an older write",async()=>{
 let done!:()=>void;f.clipboard.mockImplementationOnce(()=>new Promise<void>(resolve=>{done=resolve;}));await render();await click("Copy complete response");props={...props,responseText:"New complete response"};await render();await act(async()=>done());expect(f.close).not.toHaveBeenCalled();await click("Copy complete response");expect(f.clipboard.mock.calls.map(call=>call[0])).toEqual(["Complete response","New complete response"]);expect(f.close).toHaveBeenCalledTimes(1);
});
it("keeps message actions open when the clipboard declines a copy", async () => {
  f.clipboard.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await render();
  await click("Copy message");
  expect(f.close).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  await click("Copy message");
  expect(f.close).toHaveBeenCalledOnce();
});
it("keeps share cancellation quiet and anchors the iOS handoff",async()=>{
 vi.stubEnv("EXPO_OS","ios");f.share.mockResolvedValue({action:"dismissedAction"});await render();await click("Share");expect(f.share).toHaveBeenCalledWith({message:props.text},{anchor:73});expect(container.textContent).toContain("Sharing was cancelled.");expect(container.querySelector('[role="alert"]')).toBeNull();expect(f.close).not.toHaveBeenCalled();
});
it("does not execute retained menu callbacks after unmount",async()=>{
 await render();const old=["Copy message","Share","Save as note","Report content"].map(label=>f.rows.find(row=>row.label===label)!.press);await act(async()=>root.unmount());await act(async()=>old.forEach(action=>action()));expect(f.clipboard).not.toHaveBeenCalled();expect(f.share).not.toHaveBeenCalled();expect(f.request).not.toHaveBeenCalled();expect(f.report).not.toHaveBeenCalled();root=createRoot(container);
});

it("keeps an already-started copy visible and busy when the response disappears",async()=>{
 let done!:()=>void;f.clipboard.mockImplementationOnce(()=>new Promise<void>(resolve=>{done=resolve;}));await render();await click("Copy complete response");props={...props,responseText:undefined};await render();expect(button("Copy complete response")).toBeDefined();expect(button("Share").disabled).toBe(true);expect(container.querySelector("section")?.dataset.dismissible).toBe("false");await act(async()=>done());expect(button("Copy complete response")).toBeUndefined();expect(button("Share").disabled).toBe(false);expect(f.close).not.toHaveBeenCalled();
});
