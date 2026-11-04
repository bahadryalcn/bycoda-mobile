// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SessionCheckpoints } from "./session-checkpoints";
import type { HostSession } from "./wire";
import { RemoteHostError } from "@/remote/transport";

const state=vi.hoisted(()=>({allowed:true,epoch:true,enabled:true,paused:false,error:null as Error|null,activeId:"machine",capabilities:["workspace.run","sessions.checkpoint-review","sessions.rewind"],data:{expectedCheckpoint:"a".repeat(64),files:[{relative:"src/long-file.ts",status:"modified",additions:1,deletions:1,exact:true,undoable:true}]},commands:new Map<string,()=>void>(),confirm:undefined as undefined|(()=>void),cancel:undefined as undefined|(()=>void),mutate:vi.fn(),command:vi.fn(async(_request:Record<string,unknown>)=>({})),refresh:vi.fn(),refetch:vi.fn(async()=>undefined),close:vi.fn()}));
vi.mock("@/state/machines",()=>({useActiveMachine:()=>({id:"machine",name:"Original computer",capabilities:state.capabilities}),useMachines:{getState:()=>({activeId:state.activeId})}}));
vi.mock("@/state/connection-scope",()=>{const scope={isCurrent:()=>state.epoch};return{useConnectionScope:()=>scope};});
vi.mock("@/ui/private-access",()=>({usePrivateContentAccess:()=>({allowed:state.allowed,check:()=>state.allowed}),PrivateContentAccessProvider:({children}:PropsWithChildren)=>children}));
vi.mock("@/ui/copy",()=>({useCopy:()=> (_tr:string,en:string)=>en}));
vi.mock("@/state/queries",()=>({useHostQuery:()=>({data:state.data,isSuccess:!state.error,isError:!!state.error,error:state.error,isEnabled:state.enabled,fetchStatus:state.paused?"paused":"idle",refetch:state.refetch}),useHostMutation:()=>({mutateAsync:state.mutate})}));
vi.mock("@/ui/search-field",()=>({CollectionToolbar:({field,actions}:any)=>createElement("header",null,field,actions)}));
vi.mock("./git-diff-viewer",()=>({GitDiffViewer:()=>createElement("code",null,"Full diff preview")}));
vi.mock("./use-diff-preview",()=>({useDiffPreview:()=>({lines:[],tooLarge:false,truncated:false})}));
vi.mock("@/ui/action-review-sheet",()=>({ActionReviewSheet:({children,onClose,onConfirm,title}:any)=>{state.confirm=onConfirm;state.cancel=onClose;return createElement("aside",null,title,children);}}));
vi.mock("@/ui/primitives",()=>{
 const wrapper=({children}:any)=>createElement("div",null,children);
 const button=({label,onPress,disabled}:any)=>{state.commands.set(label,onPress);return createElement("button",{onClick:onPress,disabled},label);};
 return {Stack:wrapper,Body:wrapper,Disclosure:wrapper,Sheet:wrapper,Notice:({message}:any)=>createElement("p",null,message),ErrorText:({error}:any)=>error?createElement("p",null,error.message):null,
 QueryState:({query}:any)=>query.error?createElement("p",null,query.error.message):null,NavigationRow:button,
 FormActions:({submitLabel,onSubmit,disabled,feedback}:any)=>createElement("footer",null,feedback,button({label:submitLabel,onPress:onSubmit,disabled})),
 ActionMenu:({actions}:any)=>createElement("nav",null,...actions.filter(Boolean).map((a:any)=>button(a))),
 ScreenList:({data,header,renderItem}:any)=>createElement("main",null,header,...data.map((item:any,index:number)=>createElement("section",{key:index},renderItem({item})))),};
});
const initial=()=>({revision:3,status:"idle",authorityGeneration:2,session:{id:"session",cwd:"/project",worktreeCwd:"/worktree",blocks:[{id:"turn",role:"user",text:"Full prompt",providerTurnId:"turn-id"},{id:"answer",role:"assistant",text:"Full answer"}]}} as unknown as HostSession);
const container=document.createElement("div");let root:ReturnType<typeof createRoot>,session=initial();
async function render(overrides:Partial<React.ComponentProps<typeof SessionCheckpoints>>={}){await act(async()=>root.render(createElement(SessionCheckpoints,{scope:{machineId:"machine",sessionId:"session"},session,blocked:false,onCommand:state.command as any,onRefresh:state.refresh,onClose:state.close,...overrides})));}
async function mount(){vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);root=createRoot(container);state.mutate.mockImplementation(async(request:any)=>request.command==="session_checkpoint_file_diff"?{relative:"src/long-file.ts",original:"old",current:"new",binary:false,tooLarge:false,expectedCheckpoint:"a".repeat(64)}:{});await render();}
async function press(label:string){await act(async()=>state.commands.get(label)!());}
async function file(){await press("src/long-file.ts");expect(container.textContent).toContain("Full diff preview");}
afterEach(async()=>{await act(async()=>root?.unmount());state.allowed=true;state.epoch=true;state.enabled=true;state.paused=false;state.error=null;state.activeId="machine";state.capabilities=["workspace.run","sessions.checkpoint-review","sessions.rewind"];state.data={expectedCheckpoint:"a".repeat(64),files:[{relative:"src/long-file.ts",status:"modified",additions:1,deletions:1,exact:true,undoable:true}]};state.commands.clear();state.confirm=undefined;state.cancel=undefined;session=initial();vi.resetAllMocks();vi.unstubAllGlobals();});

it.each([false,true])("reviews complete file identity and delivers one exact command undo=%s",async(undo)=>{
 await mount();await file();await press(undo?"Undo file changes":"Keep changes");
 const aside=container.querySelector("aside")!;expect(aside.textContent).toContain("Original computer");expect(aside.textContent).toContain("/worktree");expect(aside.textContent).toContain("src/long-file.ts");expect(aside.textContent).toContain("a".repeat(64));
 const confirm=state.confirm!;await act(async()=>confirm());await act(async()=>confirm());
 expect(state.mutate).toHaveBeenLastCalledWith({command:undo?"session_checkpoint_undo":"session_checkpoint_keep",args:{sessionId:"session",cwd:"/worktree",relative:"src/long-file.ts",expectedCheckpoint:"a".repeat(64)}});expect(state.mutate).toHaveBeenCalledTimes(2);expect(state.refresh).toHaveBeenCalledOnce();
});
it("cancels a review without changing the selected diff",async()=>{await mount();await file();await press("Keep changes");const confirm=state.confirm!;await act(async()=>state.cancel!());expect(container.querySelector("aside")).toBeNull();expect(container.textContent).toContain("Full diff preview");await act(async()=>confirm());expect(state.mutate).toHaveBeenCalledTimes(1);});

it.each(["access","epoch","disabled","paused","auth","identity","blocked","scope","snapshot","capability"])("retires file review on %s and never revives its callback",async(kind)=>{
 await mount();await file();await press("Keep changes");const confirm=state.confirm!;
 if(kind==="access")state.allowed=false;if(kind==="epoch")state.epoch=false;if(kind==="disabled")state.enabled=false;if(kind==="paused")state.paused=true;if(kind==="auth"||kind==="identity")state.error=Object.assign(new Error("Private failure"),{kind});if(kind==="snapshot")state.data={...state.data,expectedCheckpoint:"b".repeat(64)};if(kind==="capability")state.capabilities=["workspace.run","sessions.rewind"];
 await render(kind==="blocked"?{blocked:true}:kind==="scope"?{scope:{machineId:"machine",sessionId:"other"}}:{});
 state.allowed=true;state.epoch=true;state.enabled=true;state.paused=false;state.error=null;state.capabilities=["workspace.run","sessions.checkpoint-review","sessions.rewind"];await render();await act(async()=>confirm());expect(state.mutate).toHaveBeenCalledTimes(1);expect(container.querySelector("aside")).toBeNull();
});

it.each(["access","snapshot","blocked"])("does not replace selection when %s changes during a pending read",async(kind)=>{
 await mount();let resolve!:(value:unknown)=>void;state.mutate.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));await press("src/long-file.ts");
 if(kind==="access")state.allowed=false;if(kind==="snapshot")state.data={...state.data,expectedCheckpoint:"b".repeat(64)};await render(kind==="blocked"?{blocked:true}:{});
 await act(async()=>resolve({relative:"src/long-file.ts",original:"old",current:"new",binary:false,tooLarge:false,expectedCheckpoint:"a".repeat(64)}));state.allowed=true;await render();expect(container.textContent).not.toContain("Full diff preview");
});

it("keeps a stale diff inspectable while requiring a fresh checkpoint review",async()=>{await mount();await file();state.data={...state.data,expectedCheckpoint:"b".repeat(64)};await render();expect(container.textContent).toContain("The checkpoint changed");await press("Keep changes");expect(container.querySelector("aside")).toBeNull();expect(state.mutate).toHaveBeenCalledTimes(1);});

it("latches an unknown write but still permits read-only reconciliation",async()=>{await mount();await file();await press("Keep changes");state.mutate.mockRejectedValueOnce(new RemoteHostError("machine","network","Unknown write",true));await act(async()=>state.confirm!());expect(container.textContent).toContain("The result is uncertain");await press("Refresh");await press("Keep changes");expect(state.mutate).toHaveBeenCalledTimes(2);expect(state.refetch).toHaveBeenCalledOnce();});

it("lets a known refusal receive a new explicit review",async()=>{await mount();await file();await press("Keep changes");state.mutate.mockRejectedValueOnce(new Error("Refused"));await act(async()=>state.confirm!());expect(container.textContent).toContain("Refused");await press("Keep changes");expect(container.querySelector("aside")).not.toBeNull();});

it("reviews the exact affected suffix and preserves rewind authority",async()=>{await mount();await press("Full prompt");expect(container.querySelector("aside")!.textContent).toContain("Full answer");const confirm=state.confirm!;await act(async()=>confirm());await act(async()=>confirm());expect(state.command).toHaveBeenCalledExactlyOnceWith({type:"rewind",sessionId:"session",blockId:"turn",expectedRevision:3,authorityGeneration:2});});

it("retires rewind when the session changes",async()=>{await mount();await press("Full prompt");const confirm=state.confirm!;session={...session,revision:4};await render();await act(async()=>confirm());expect(state.command).not.toHaveBeenCalled();expect(container.querySelector("aside")).toBeNull();});

it("ignores an accepted completion after unmount",async()=>{await mount();await file();await press("Keep changes");let resolve!:(value:unknown)=>void;state.mutate.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));await act(async()=>state.confirm!());await act(async()=>root.unmount());await act(async()=>resolve({}));expect(state.refresh).not.toHaveBeenCalled();expect(state.refetch).not.toHaveBeenCalled();});

it("renders an empty source without invoking a disabled query validator",async()=>{session={...session,session:{...session.session,cwd:"",worktreeCwd:""}};await mount();expect(container.textContent).toContain("Original computer");});

it("rejects a queued read for a file whose checkpoint is not exact",async()=>{state.data={...state.data,files:[{...state.data.files[0]!,exact:false}]};await mount();await press("src/long-file.ts");expect(state.mutate).not.toHaveBeenCalled();});
