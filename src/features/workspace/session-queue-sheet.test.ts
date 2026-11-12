// @vitest-environment happy-dom
import { act,createElement,type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach,expect,it,vi } from "vitest";
import { SessionQueueSheet,type QueueSheetActions,type QueueSheetState } from "./session-queue-sheet";
const f=vi.hoisted(()=>({allowed:true,epoch:true,activeId:"m",commands:new Map<string,()=>void>()}));
vi.mock("react-native",()=>({View:({children}:PropsWithChildren)=>createElement("div",null,children)}));
vi.mock("lucide-react-native/icons/refresh-cw",()=>({default:()=>null}));
vi.mock("lucide-react-native/icons/pause",()=>({default:()=>null}));
vi.mock("lucide-react-native/icons/play",()=>({default:()=>null}));
vi.mock("lucide-react-native/icons/pencil",()=>({default:()=>null}));
vi.mock("lucide-react-native/icons/arrow-up",()=>({default:()=>null}));
vi.mock("lucide-react-native/icons/arrow-down",()=>({default:()=>null}));
vi.mock("lucide-react-native/icons/trash-2",()=>({default:()=>null}));
vi.mock("@/ui/theme",()=>({useMobileTheme:()=>({uiStyles:{caption:{}},colors:{danger:"d",muted:"m"}})}));
vi.mock("@/state/machines",()=>({useMachines:Object.assign((select:any)=>select({machines:[{id:"m",name:"Original computer"}]}),{getState:()=>({activeId:f.activeId})})}));
vi.mock("@/state/connection-scope",()=>{const value={isCurrent:()=>f.epoch};return{useConnectionScope:()=>value};});
vi.mock("@/ui/private-access",()=>({usePrivateContentAccess:()=>({allowed:f.allowed,check:()=>f.allowed}),PrivateContentAccessProvider:({children}:PropsWithChildren)=>children}));
vi.mock("@/ui/use-list-scroll-memory",()=>({useListScrollMemory:()=>({listProps:{}})}));
vi.mock("@/ui/copy",()=>({useCopy:()=> (_tr:string,en:string)=>en}));
vi.mock("@/ui/styles",()=>({uiStyles:{caption:{}}}));
vi.mock("@/ui/search-field",()=>({CollectionToolbar:({field,actions}:any)=>createElement("header",null,field,actions)}));
vi.mock("@/ui/primitives",()=>{
 const content=({children}:any)=>createElement("div",null,children);
 const button=({label,onPress,disabled}:any)=>{f.commands.set(label,onPress);return createElement("button",{disabled,onClick:onPress},label);};
 return{Body:content,Row:content,Stack:content,Badge:({label}:any)=>createElement("span",null,label),Empty:({title}:any)=>createElement("p",null,title),ErrorText:({error,message}:any)=>error?createElement("p",null,message||error.message):null,Notice:({message}:any)=>createElement("p",null,message), StateView: ({ title }:any) => createElement("p",null,title),Sheet:({visible,title,children}:any)=>visible?createElement("article",{"aria-label":title},children):null,NavigationRow:button,
 ActionMenu:({actions}:any)=>createElement("nav",null,...actions.filter(Boolean).map((action:any)=>createElement("section",{key:action.key},button(action)))),
 FormActions:({submitLabel,onSubmit,disabled,onCancel,cancelLabel,feedback}:any)=>createElement("footer",null,feedback,button({label:submitLabel,onPress:onSubmit,disabled}),onCancel?button({label:cancelLabel,onPress:onCancel}):null)};
});
vi.mock("@/ui/screen-list",()=>({ScreenList:({data,header,renderItem}:any)=>createElement("main",null,header,...data.map((item:any,index:number)=>createElement("section",{key:index},renderItem({item,index}))))}));
const rows=[{id:"first",text:"First queued message",attachments:[{id:"file",name:"Complete attachment.txt",size:1024,mimeType:"text/plain",kind:"file"}]},{id:"second",text:"Second queued message",attachments:[]}] as QueueSheetState["rows"];
const initial=():QueueSheetState=>({rows,label:"Paused",error:null,disabled:false,sending:false,controlling:false,reloadBusy:false,queueError:false,active:false,canEdit:true,hasDraft:false,disableSend:false,disableControl:false});
let state=initial(),root:ReturnType<typeof createRoot>;
const actions:QueueSheetActions={close:vi.fn(),reload:vi.fn(),resume:vi.fn(),send:vi.fn(),control:vi.fn(),edit:vi.fn(),move:vi.fn(),remove:vi.fn()},container=document.createElement("div");
async function render(overrides:Partial<React.ComponentProps<typeof SessionQueueSheet>>={}){await act(async()=>root.render(createElement(SessionQueueSheet,{scope:{machineId:"m",sessionId:"session"},visible:true,state,actions,...overrides})));}
async function mount(){vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);root=createRoot(container);await render();}
async function press(label:string){await act(async()=>f.commands.get(label)!());}
afterEach(async()=>{await act(async()=>root?.unmount());state=initial();f.allowed=true;f.epoch=true;f.activeId="m";f.commands.clear();vi.clearAllMocks();vi.unstubAllGlobals();});
it("opening and inspecting a queued message never sends and retains full attachments",async()=>{await mount();await press("First queued message");expect(container.querySelector('article[aria-label="Message"]')!.textContent).toContain("Complete attachment.txt");expect(actions.send).not.toHaveBeenCalled();expect(actions.edit).not.toHaveBeenCalled();});
it("keeps explicit send and pause/start actions separate",async()=>{await mount();await press("Send next");expect(actions.send).toHaveBeenCalledOnce();expect(actions.control).not.toHaveBeenCalled();await press("Start queue");expect(actions.control).toHaveBeenCalledOnce();});
it("does not turn a captured Pause action into Start after state changes",async()=>{state.active=true;await mount();const pause=f.commands.get("Pause queue")!;state={...state,active:false};await render();await act(async()=>pause());expect(actions.control).not.toHaveBeenCalled();});
it("keeps reorder/remove bound to the exact row and respects boundaries",async()=>{await mount();await press("Move up");expect(actions.move).toHaveBeenCalledExactlyOnceWith("second",-1);await press("Move down");expect(actions.move).toHaveBeenCalledOnce();await press("Remove from queue");expect(actions.remove).toHaveBeenCalledExactlyOnceWith("second");});
it("opens the existing editor without changing the row payload",async()=>{await mount();await press("First queued message");await press("Pause queue and edit");expect(actions.edit).toHaveBeenCalledExactlyOnceWith(rows[0]);expect(container.querySelector('article[aria-label="Message"]')).toBeNull();});
it("offers resume instead of Send for an existing draft",async()=>{state={...state,hasDraft:true,canEdit:false,disableSend:true,disableControl:true};await mount();expect([...container.querySelectorAll("button")].some(button=>button.textContent==="Send next")).toBe(false);await press("Continue editing");expect(actions.resume).toHaveBeenCalledOnce();});
it("offers read-only reload for unconfirmed delivery and deduplicates identical feedback",async()=>{state={...state,warning:"Unknown delivery",error:new Error("Unknown delivery"),errorMessage:"Unknown delivery",disableSend:true};await mount();expect(container.textContent!.split("Unknown delivery")).toHaveLength(2);expect([...container.querySelectorAll("button")].some(button=>button.textContent==="Send next")).toBe(false);await press("Reload queue");expect(actions.reload).toHaveBeenCalledOnce();expect(actions.send).not.toHaveBeenCalled();});
it.each(["access","epoch","active","machine","session","hidden","auth"])("retires cached reads and row actions after %s changes",async(kind)=>{await mount();await press("First queued message");const remove=f.commands.get("Remove from queue")!;
 if(kind==="access")f.allowed=false;if(kind==="epoch")f.epoch=false;if(kind==="active")f.activeId="other";if(kind==="auth")state={...state,error:Object.assign(new Error("Private failure"),{kind:"auth"})};await render(kind==="hidden"?{visible:false}:kind==="machine"?{scope:{machineId:"other",sessionId:"session"}}:kind==="session"?{scope:{machineId:"m",sessionId:"other"}}:{});expect(container.querySelector('article[aria-label="Message"]')).toBeNull();f.allowed=true;f.epoch=true;f.activeId="m";state={...state,error:null};await render();await act(async()=>remove());expect(actions.remove).not.toHaveBeenCalled();expect(container.querySelector('article[aria-label="Message"]')).toBeNull();
});
it("rejects stale row writes after replacement and closes removed readers",async()=>{await mount();const remove=f.commands.get("Remove from queue")!;await press("Second queued message");state={...state,rows:[rows[0]!]};await render();await act(async()=>remove());expect(actions.remove).not.toHaveBeenCalled();expect(container.querySelector('article[aria-label="Message"]')).toBeNull();});
it("does not mutate while blocked, but still permits read-only reload",async()=>{state={...state,disabled:true,disableSend:true,disableControl:true};await mount();await press("Remove from queue");await press("Send next");await press("Start queue");await press("Reload queue");expect(actions.remove).not.toHaveBeenCalled();expect(actions.send).not.toHaveBeenCalled();expect(actions.control).not.toHaveBeenCalled();expect(actions.reload).toHaveBeenCalledOnce();});
it("keeps an empty queue closable while workspace actions are blocked",async()=>{state={...state,rows:[],disabled:true};await mount();await press("Close");expect(actions.close).toHaveBeenCalledOnce();});
it("keeps a read-only message closable when a queue error blocks editing",async()=>{state={...state,queueError:true,disabled:true,disableSend:true};await mount();await press("First queued message");const reader=container.querySelector('article[aria-label="Message"]')!;expect(reader.querySelector("footer button")!.hasAttribute("disabled")).toBe(false);await press("Close");expect(container.querySelector('article[aria-label="Message"]')).toBeNull();expect(actions.edit).not.toHaveBeenCalled();});
it("keeps presentation closure available while the original owner handles dispatch",async()=>{await mount();const close=f.commands.get("Close")!;state={...state,sending:true,disabled:true,disableSend:true};await render();await act(async()=>close());expect(actions.close).toHaveBeenCalledOnce();expect(actions.send).not.toHaveBeenCalled();});
it("ignores retained callbacks after unmount",async()=>{await mount();const remove=f.commands.get("Remove from queue")!;await act(async()=>root.unmount());await act(async()=>remove());expect(actions.remove).not.toHaveBeenCalled();});
