// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { WorktreeRemoval } from "./worktree-removal";
const f = vi.hoisted(() => ({ allowed:true,epoch:true,enabled:true,paused:false,queryError:null as Error|null,digestGate:undefined as undefined|(()=>Promise<void>),saveGate:undefined as undefined|(()=>Promise<void>),closed:vi.fn(),commands:new Map<string,()=>void>(),cancel:undefined as undefined|(()=>void),queryData:{worktrees:[{path:"/trees/task",branch:"task",isMain:false,missing:false}]},raw: null as string | null, activeId: "machine", endpoint: "https://fixture", request: vi.fn(), confirmation: undefined as undefined | (() => void), failSave: false }));
const review = { reviewId: "review", expiresAt: Date.now() + 120000, projectCwd: "/repo", path: "/trees/task", branch: "task", head: "abc", dirty: false, unpushed: 0, sessionIds: ["idle"], activeSessionIds: [], hasTerminals: false, hasAgents: false, hasOpenFiles: false, canRemove: true, reasons: [], effects: { detachSessionIds: ["idle"], rebindProjectCwd: "/repo" }, atomic: false };
vi.mock("expo-crypto", () => ({ randomUUID: () => "request", digestStringAsync: async () => {await f.digestGate?.();return "a".repeat(64);}, CryptoDigestAlgorithm: { SHA256: "SHA256" } }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => f.raw, setItem: async (_key: string, value: string) => { if (f.failSave) throw new Error("Storage failed");await f.saveGate?.(); f.raw = value; }, removeItem: async () => { f.raw = null; } } }));
vi.mock("@/state/connection-scope",()=>{const scope={isCurrent:()=>f.epoch};return{useConnectionScope:()=>scope};});
vi.mock("@/ui/private-access",()=>({usePrivateContentAccess:()=>({allowed:f.allowed,check:()=>f.allowed}),PrivateContentAccessProvider:({children}:PropsWithChildren)=>children}));
vi.mock("@/ui/search-field",()=>({CollectionToolbar:({field,actions}:any)=>createElement("header",null,field,actions)}));
vi.mock("@/ui/action-review-sheet",()=>({ActionReviewSheet:({children,onConfirm,onClose,submitLabel,disabled,feedback}:any)=>{f.confirmation=onConfirm;f.cancel=onClose;return createElement("aside",null,children,feedback,createElement("button",{disabled,onClick:onConfirm},submitLabel));}}));
vi.mock("@/state/machines", () => {
  const machine = () => ({ id: "machine", environmentId: "env", endpoint: f.endpoint, lanKey: "fixture-key", capabilities: ["worktrees.removal.desktop.v1"] });
  return { useActiveMachine: machine, useMachines: { getState: () => ({ activeId: f.activeId, machines: [machine()] }) } };
});
vi.mock("@/state/queries", () => ({ useHostClient: () => ({ request: f.request }), useHostQuery: () => ({ isSuccess: !f.queryError,isError:!!f.queryError,error:f.queryError,isEnabled:f.enabled,fetchStatus:f.paused?"paused":"idle",data:f.queryData, refetch: async () => {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({ confirmAction: (_a: string, _b: string, _c: string, done: () => void) => { f.confirmation = done; } }));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Sheet: wrapper, Stack:wrapper,Disclosure:wrapper,Body: wrapper, Notice: ({ message }: { message: string }) => createElement("div", null, message), ErrorText: ({error}:any) => error?createElement("p",null,error.message):null, QueryState: () => null,
    ScreenList:({data,header,renderItem}:any)=>createElement("section",null,header,...data.map((item:any,index:number)=>createElement("div",{key:index},renderItem({item})))),
    ActionMenu:({actions}:any)=>createElement("nav",null,...actions.filter(Boolean).map((action:any)=>{f.commands.set(action.label,action.onPress);return createElement("button",{key:action.key,disabled:action.disabled,onClick:action.onPress},action.label);})),
    FormActions:({submitLabel,disabled,onSubmit,onCancel,cancelLabel,feedback}:any)=>{f.commands.set(submitLabel,onSubmit);return createElement("footer",null,feedback,createElement("button",{disabled,onClick:onSubmit},submitLabel),onCancel?createElement("button",{onClick:onCancel},cancelLabel):null);},
    Button: ({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label),
    SelectField: ({ onChange }: { onChange: (value: string) => void }) => createElement("button", { onClick: () => onChange("/trees/task") }, "Choose task") };
});
let root: ReturnType<typeof createRoot>; const element = document.createElement("div");
async function render(overrides:Partial<React.ComponentProps<typeof WorktreeRemoval>>={}){await act(async()=>root.render(createElement(WorktreeRemoval,{scope:{machineId:"machine",sessionId:"base"},projectId:"project",onClose:f.closed,...overrides})));}
async function mount() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root = createRoot(element); await render(); }
async function click(label: string) { await act(async () => [...element.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
async function openReview() { await mount(); await click("Choose task"); await click("Review removal"); }
afterEach(async () => { await act(async () => root?.unmount());f.allowed=true;f.epoch=true;f.enabled=true;f.paused=false;f.queryError=null;f.digestGate=undefined;f.saveGate=undefined;f.commands.clear();f.queryData={worktrees:[{path:"/trees/task",branch:"task",isMain:false,missing:false}]}; f.raw = null; f.activeId = "machine"; f.endpoint = "https://fixture"; f.failSave = false; f.confirmation = undefined; vi.resetAllMocks();vi.restoreAllMocks();vi.useRealTimers(); vi.unstubAllGlobals(); });
it("persists intent before native approval and restores status-only without replay", async () => {
  f.request.mockImplementation(async (method: string) => { if (method.endsWith("review")) return review; if (method.endsWith("approve")) { expect(f.raw).toContain("request"); throw new Error("Lost response"); } return { state: "unknown" }; });
  await openReview(); await click("Request computer approval");
  expect(f.request.mock.calls.filter(([method]) => method.endsWith("approve"))).toHaveLength(1);
  await act(async () => root.unmount()); await mount(); await click("Read result");
  expect(f.request.mock.calls.filter(([method]) => method.endsWith("approve"))).toHaveLength(1);
  expect(f.request).toHaveBeenLastCalledWith("worktrees.removal.status", { projectId: "project", sessionId: "base", requestId: "request" });
});
it("refuses approval when durable storage fails", async () => {
  f.request.mockResolvedValue(review); await openReview(); f.failSave = true; await click("Request computer approval");
  expect(f.request.mock.calls.map(([method]) => method)).toEqual(["worktrees.removal.review"]);
});
it("refuses delayed approval after same-ID endpoint re-pair", async () => {
  f.request.mockResolvedValue(review); await openReview(); f.endpoint = "https://different"; await click("Request computer approval");
  expect(f.request.mock.calls.map(([method]) => method)).toEqual(["worktrees.removal.review"]);
});
it("unknown receipt requires a separate explicit local-only clear confirmation", async () => {
  f.raw = JSON.stringify({ operationId: "saved", environmentId: "env", digest: "a".repeat(64) }); f.request.mockResolvedValue({ state: "unknown" });
  await mount(); await click("Read result"); await click("Clear local tracking"); expect(f.raw).not.toBeNull();
  await act(async () => f.confirmation!()); expect(f.raw).toBeNull();
  expect(f.request.mock.calls.map(([method]) => method)).toEqual(["worktrees.removal.status"]);
});

function responses(){f.request.mockImplementation(async(method:string)=>method.endsWith("review")?review:{state:"unknown",path:"/trees/task",message:"Inspect the original computer"});}
async function command(label:string){await act(async()=>f.commands.get(label)!());}
const saved=(environmentId="env")=>JSON.stringify({operationId:"saved",environmentId,digest:"a".repeat(64)});

it("cancels review without sending and rejects its retained confirmation",async()=>{responses();await openReview();const confirm=f.confirmation!;await act(async()=>f.cancel!());expect(element.querySelector("aside")).toBeNull();await act(async()=>confirm());expect(f.raw).toBeNull();expect(f.request).toHaveBeenCalledTimes(1);});

it.each(["access","epoch","disabled","paused","auth","identity","project","session","snapshot"])("retires review after %s changes and does not revive approval",async(kind)=>{
 responses();await openReview();const confirm=f.confirmation!;
 if(kind==="access")f.allowed=false;if(kind==="epoch")f.epoch=false;if(kind==="disabled")f.enabled=false;if(kind==="paused")f.paused=true;if(kind==="auth"||kind==="identity")f.queryError=Object.assign(new Error("Private failure"),{kind});if(kind==="snapshot")f.queryData={worktrees:[{...f.queryData.worktrees[0]!}]};
 await render(kind==="project"?{projectId:"other"}:kind==="session"?{scope:{machineId:"machine",sessionId:"other"}}:{});
 f.allowed=true;f.epoch=true;f.enabled=true;f.paused=false;f.queryError=null;await render();await act(async()=>confirm());expect(f.raw).toBeNull();expect(f.request).toHaveBeenCalledTimes(1);expect(element.querySelector("aside")).toBeNull();
});

it.each(["access","snapshot"])("ignores a delayed review after %s changes",async(kind)=>{
 let resolve!:(value:unknown)=>void;f.request.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));await mount();await click("Choose task");await command("Review removal");if(kind==="access")f.allowed=false;else f.queryData={worktrees:[]};await render();await act(async()=>resolve(review));f.allowed=true;await render();expect(element.querySelector("aside")).toBeNull();
});

it.each(["expiry","access"])("does not persist or send if %s changes while hashing",async(kind)=>{
 responses();await openReview();let resolve!:()=>void;f.digestGate=()=>new Promise(done=>{resolve=done;});await click("Request computer approval");if(kind==="expiry")vi.spyOn(Date,"now").mockReturnValue(review.expiresAt+1);else{f.allowed=false;await render();f.allowed=true;await render();}await act(async()=>resolve());expect(f.raw).toBeNull();expect(f.request).toHaveBeenCalledTimes(1);
});

it.each(["expiry","access"])("clears only its unsent durable claim if %s changes during storage",async(kind)=>{
 responses();await openReview();let resolve!:()=>void;f.saveGate=()=>new Promise(done=>{resolve=done;});await click("Request computer approval");if(kind==="expiry")vi.spyOn(Date,"now").mockReturnValue(review.expiresAt+1);else{f.allowed=false;await render();f.allowed=true;await render();}await act(async()=>resolve());expect(f.raw).toBeNull();expect(f.request).toHaveBeenCalledTimes(1);
});

it("allows saved-result reads when the folder query is intentionally disabled",async()=>{f.raw=saved();f.enabled=false;responses();await mount();await click("Read result");expect(f.request).toHaveBeenCalledExactlyOnceWith("worktrees.removal.status",{projectId:"project",sessionId:"base",requestId:"saved"});expect(element.textContent).toContain("Inspect the original computer");});

it("blocks a wrong-environment saved receipt instead of sending a status request",async()=>{f.raw=saved("other-env");responses();await mount();expect(element.textContent).not.toContain("saved");await render();expect(f.request).not.toHaveBeenCalled();expect(f.raw).toBe(saved("other-env"));});

it("does not offer or execute clear for a pending desktop approval",async()=>{f.raw=saved();f.request.mockResolvedValue({state:"pending"});await mount();await click("Read result");await command("Clear local tracking");expect(element.querySelector("aside")).toBeNull();expect(f.raw).toBe(saved());});

it("retires local-clear confirmation when the receipt changes",async()=>{f.raw=saved();responses();await mount();await click("Read result");await command("Clear local tracking");const confirm=f.confirmation!;f.request.mockResolvedValueOnce({state:"pending"});await command("Read result");await act(async()=>confirm());expect(f.raw).toBe(saved());expect(element.querySelector("aside")).toBeNull();});

it("conveys blocked reasons without allowing computer approval",async()=>{f.request.mockResolvedValue({...review,canRemove:false,dirty:true,reasons:["Working folder has uncommitted changes"]});await openReview();expect(element.querySelector("aside")!.textContent).toContain("Working folder has uncommitted changes");const confirm=f.confirmation!;await act(async()=>confirm());expect(f.raw).toBeNull();expect(f.request).toHaveBeenCalledTimes(1);});

it("does not permit an invalid saved record to become a new write after clearing its error",async()=>{f.raw="invalid";responses();await mount();await command("Clear error");await click("Choose task");await command("Review removal");expect(f.request).not.toHaveBeenCalled();expect(f.raw).toBe("invalid");});

it("rejects selection of main or missing folders in queued callbacks",async()=>{f.queryData={worktrees:[{path:"/trees/task",branch:"task",isMain:true,missing:false}]};responses();await mount();await click("Choose task");await command("Review removal");expect(f.request).not.toHaveBeenCalled();});

it("keeps cached receipt concealed during an access-failure retry until a new read succeeds",async()=>{
 f.raw=saved();responses();await mount();await click("Read result");expect(element.textContent).toContain("Inspect the original computer");
 f.request.mockRejectedValueOnce(Object.assign(new Error("Status access expired"),{kind:"auth"}));await command("Read result");expect(element.textContent).not.toContain("Inspect the original computer");
 let resolve!:(value:unknown)=>void;f.request.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));await command("Read result");expect(element.textContent).not.toContain("Inspect the original computer");await act(async()=>resolve({state:"applied",message:"Fresh authorized result"}));expect(element.textContent).toContain("Fresh authorized result");expect(element.textContent).not.toContain("Status access expired");
});

it("disables the visible desktop-approval action when its review expires",async()=>{
 vi.useFakeTimers();vi.setSystemTime(review.expiresAt-50);responses();await openReview();await act(async()=>{await vi.advanceTimersByTimeAsync(51);});expect(element.textContent).toContain("This review expired");const button=[...element.querySelectorAll("button")].find(button=>button.textContent==="Request computer approval")!;expect(button.disabled).toBe(true);await act(async()=>f.confirmation!());expect(f.request).toHaveBeenCalledTimes(1);
});

it("does not reveal a status retry after an intervening private-access loss and return",async()=>{
 f.raw=saved();f.request.mockRejectedValueOnce(Object.assign(new Error("Status expired"),{kind:"auth"}));await mount();await command("Read result");let resolve!:(value:unknown)=>void;f.request.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));await command("Read result");f.allowed=false;await render();f.allowed=true;await render();await act(async()=>resolve({state:"applied",message:"Retired repair result"}));expect(element.textContent).not.toContain("Retired repair result");
});
