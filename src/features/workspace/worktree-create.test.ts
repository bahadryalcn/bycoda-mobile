// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { WorktreeCreate } from "./worktree-create";

const state = vi.hoisted(() => ({ allowed:true,epoch:true,enabled:true,paused:false,error:null as Error|null,treeError:null as Error|null,dismiss:undefined as undefined|(()=>void),commands:new Map<string,()=>void>(),fields:new Map<string,any>(),closed:vi.fn(),branches:{current:"main",branches:["main","available"],remotes:[{remote:"origin",name:"release"}]},trees:{defaultRoot:"/host/worktrees",worktrees:[] as any[]},activeId: "machine", confirmation: undefined as undefined | (() => void), write: vi.fn(), refetch: vi.fn(async () => undefined), beforeChange: vi.fn(async () => undefined), select: vi.fn() }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/ui/tokens", () => ({ space: { sm: 8 } }));
vi.mock("@/state/connection-scope",()=>{const scope={isCurrent:()=>state.epoch};return{useConnectionScope:()=>scope};});
vi.mock("@/ui/private-access",()=>({usePrivateContentAccess:()=>({allowed:state.allowed,check:()=>state.allowed}),PrivateContentAccessProvider:({children}:PropsWithChildren)=>children}));
vi.mock("@/ui/search-field",()=>({CollectionToolbar:({field,actions}:any)=>createElement("section",null,field,actions)}));
vi.mock("@/ui/action-review-sheet",()=>({ActionReviewSheet:({children,onConfirm,onClose}:PropsWithChildren<{onConfirm:()=>void;onClose:()=>void}>)=>{state.confirmation=onConfirm;state.dismiss=onClose;return createElement("aside",null,children);}}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({ confirmAction: (_title: string, _detail: string, _label: string, callback: () => void) => { state.confirmation = callback; } }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "machine", name:"Original computer", capabilities: ["git.worktreeCreate"] }), useMachines: { getState: () => ({ activeId: state.activeId }) } }));
vi.mock("@/state/queries", () => ({
  useHostMutation: () => ({ mutateAsync: state.write }),
  useHostQuery: (_key:unknown,method:string)=>({isSuccess:true,isError:!!(method==="git.branches"?state.error:state.treeError),isEnabled:state.enabled,fetchStatus:state.paused?"paused":"idle",error:method==="git.branches"?state.error:state.treeError,data:method==="git.branches"?state.branches:state.trees,refetch:state.refetch}),
}));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => {state.commands.set(label,onPress);return createElement("button", { disabled, onClick: onPress }, label);};
  return { Stack:wrapper, Disclosure:wrapper, Body: wrapper, ActionMenu:({actions}:any)=>createElement("nav",null,...actions.filter(Boolean).map((a:any)=>button({label:a.label,disabled:a.disabled,onPress:a.onPress}))), Button: button, QueryState: ({query}:any) => query.error?createElement("p",null,query.error.message):null, SelectField: (props:any) => {state.fields.set(props.label,props);return null;},
    Sheet: ({ visible, children }: PropsWithChildren<{ visible: boolean }>) => visible ? wrapper({ children }) : null,
    ErrorText: ({error}:any) => error ? createElement("p",null,error.message) : null, Notice: ({ message }: { message: string }) => createElement("div", null, message), StateView: ({ title }: { title: string }) => createElement("div", null, title),
    Field: ({ value, onChangeText }: { value: string; onChangeText: (text: string) => void }) => {state.fields.set("New branch name",{value,onChangeText});return createElement("input", { value, onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChangeText(event.target.value), onInput: (event: React.FormEvent<HTMLInputElement>) => onChangeText(event.currentTarget.value) });},
    FormActions: ({ submitLabel, disabled, onSubmit, onCancel, cancelLabel, cancelDisabled, feedback }: any) => createElement("footer",null,feedback,button({ label: submitLabel, disabled, onPress: onSubmit }),onCancel ? button({label:cancelLabel,disabled:cancelDisabled,onPress:onCancel}) : null),
  };
});
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root?.unmount()); state.allowed=true;state.epoch=true;state.enabled=true;state.paused=false;state.error=null;state.treeError=null;state.commands.clear();state.fields.clear();state.trees={defaultRoot:"/host/worktrees",worktrees:[]};state.branches={current:"main",branches:["main","available"],remotes:[{remote:"origin",name:"release"}]};state.activeId = "machine"; state.confirmation = undefined; vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  await act(async () => root.render(createElement(WorktreeCreate, { scope: { machineId: "machine", projectId: "project", cwd: "/source" }, visible: true, blocked: false, beforeChange: state.beforeChange, onSelect: state.select, onClose: state.closed })));
  await act(async () => { const input = container.querySelector("input")!; input.value = "new-feature"; input.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function render(overrides:Partial<React.ComponentProps<typeof WorktreeCreate>>={}) {
  await act(async()=>root.render(createElement(WorktreeCreate,{scope:{machineId:"machine",projectId:"project",cwd:"/source"},visible:true,blocked:false,beforeChange:state.beforeChange,onSelect:state.select,onClose:state.closed,...overrides})));
}
async function press(label:string) { await act(async()=>state.commands.get(label)!()); }
async function review() { await press("Create worktree"); return state.confirmation!; }
it("confirms the frozen source and branch once and refuses retargeting to another machine", async () => {
  await mount();
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Create worktree")!.click());
  expect(state.write).not.toHaveBeenCalled(); expect(state.confirmation).toBeTypeOf("function");
  state.activeId = "different";
  await act(async () => state.confirmation!());
  expect(state.write).not.toHaveBeenCalled();
});
it("keeps an unknown creation latched while allowing read-only reconciliation", async () => {
  state.write.mockRejectedValueOnce(Object.assign(new Error("Disconnected"), { uncertain: true }));
  await mount();
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Create worktree")!.click());
  const confirm = state.confirmation!;
  await act(async () => confirm()); await act(async () => confirm());
  expect(state.write).toHaveBeenCalledExactlyOnceWith({ projectId: "project", cwd: "/source", branch: "new-feature", base: "HEAD", existing: false });
  expect(container.textContent).toContain("The create result is uncertain");
  expect([...container.querySelectorAll("button")].some(button=>button.textContent==="Create worktree")).toBe(false);
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Refresh working folders")!.click());
  expect(state.refetch).toHaveBeenCalledTimes(2); expect(state.write).toHaveBeenCalledTimes(1);
});
it("creates once and preserves the selected checkout when the existing draft guard refuses selection", async () => {
  state.write.mockResolvedValueOnce({ path: "/host/worktrees/wt-new-feature", branch: "new-feature", head: "a".repeat(40), isMain: false, missing: false });
  state.beforeChange.mockRejectedValueOnce(new Error("Keep current draft"));
  await mount();
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Create worktree")!.click());
  const confirm = state.confirmation!;
  await act(async () => confirm()); await act(async () => confirm());
  expect(state.write).toHaveBeenCalledTimes(1); expect(state.select).not.toHaveBeenCalled();
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Use this working folder")!.click());
  expect(state.beforeChange).toHaveBeenCalledTimes(1); expect(state.select).not.toHaveBeenCalled();
  expect(container.textContent).toContain("/host/worktrees/wt-new-feature");
});

it("reviews the full source and base while cancellation retains the same input and selection",async()=>{
  await mount();
  await act(async()=>state.fields.get("Base branch").onChange("origin/release"));
  const input=container.querySelector("input")!; input.setSelectionRange(2,5);
  const confirm=await review();
  expect(container.querySelector("aside")!.textContent).toContain("Original computer");
  expect(container.querySelector("aside")!.textContent).toContain("/source");
  expect(container.querySelector("aside")!.textContent).toContain("origin/release");
  await act(async()=>state.dismiss!());
  expect(container.querySelector("input")).toBe(input);
  expect(input.value).toBe("new-feature"); expect(input.selectionStart).toBe(2);
  await act(async()=>confirm()); expect(state.write).not.toHaveBeenCalled();
});

it.each(["access","epoch","disabled","paused","auth","identity","blocked","scope","snapshot"])("retires a review after %s changes even when access returns",async(kind)=>{
  await mount(); const confirm=await review();
  if(kind==="access")state.allowed=false;
  if(kind==="epoch")state.epoch=false;
  if(kind==="disabled")state.enabled=false;
  if(kind==="paused")state.paused=true;
  if(kind==="auth"||kind==="identity")state.error=Object.assign(new Error("Private failure"),{kind});
  if(kind==="snapshot")state.trees={...state.trees,worktrees:[{branch:"new-feature",path:"/already"}]};
  await render(kind==="blocked"?{blocked:true}:kind==="scope"?{scope:{machineId:"machine",projectId:"other",cwd:"/source"}}:{});
  state.allowed=true;state.epoch=true;state.enabled=true;state.paused=false;state.error=null;
  await render(); await act(async()=>confirm());
  expect(state.write).not.toHaveBeenCalled(); expect(container.querySelector("aside")).toBeNull();
});

it("retains a hidden draft but rejects callbacks from the previous editor lifetime",async()=>{
  await mount(); const field=state.fields.get("New branch name"), close=state.commands.get("Cancel")!;
  const confirm=await review();
  await render({visible:false}); await render();
  await act(async()=>{field.onChangeText("stale-name");close();confirm();});
  expect(container.querySelector("input")!.value).toBe("new-feature");
  expect(state.closed).not.toHaveBeenCalled(); expect(state.write).not.toHaveBeenCalled();
});

it("accepts batched field changes and retires the superseded approval",async()=>{
  await mount(); const confirm=await review();
  await act(async()=>{state.fields.get("New branch name").onChangeText("updated");state.fields.get("Base branch").onChange("main");});
  await act(async()=>confirm()); expect(state.write).not.toHaveBeenCalled();
  const next=await review(); await act(async()=>next());
  expect(state.write).toHaveBeenCalledExactlyOnceWith({projectId:"project",cwd:"/source",branch:"updated",base:"main",existing:false});
});

it("keeps the branch when the current mode is selected and excludes occupied local branches",async()=>{
  state.trees={...state.trees,worktrees:[{branch:"main",path:"/source",isMain:true}]};
  await mount();
  await act(async()=>state.fields.get("Branch selection").onChange("new"));
  expect(container.querySelector("input")!.value).toBe("new-feature");
  await act(async()=>state.fields.get("Branch selection").onChange("existing"));
  expect(state.fields.get("Branch").options).toEqual([{value:"available",label:"available"}]);
  await act(async()=>state.fields.get("Branch").onChange("available"));
  const confirm=await review(); await act(async()=>confirm());
  expect(state.write).toHaveBeenCalledExactlyOnceWith({projectId:"project",cwd:"/source",branch:"available",base:"HEAD",existing:true});
});

it("retains an accepted result arriving while hidden without selecting it",async()=>{
  let resolve!:(value:unknown)=>void;state.write.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  await mount();const confirm=await review();await act(async()=>confirm());
  await render({visible:false});
  await act(async()=>resolve({path:"/created",branch:"new-feature",head:"a".repeat(40),isMain:false,missing:false}));
  await render();expect(container.textContent).toContain("/created");expect(state.select).not.toHaveBeenCalled();
});

it.each(["hidden","blocked","access"])("does not navigate if %s changes during the draft guard",async(kind)=>{
  state.write.mockResolvedValueOnce({path:"/created",branch:"new-feature",head:"a".repeat(40),isMain:false,missing:false});
  let resolve!:()=>void;state.beforeChange.mockImplementationOnce(()=>new Promise<undefined>(done=>{resolve=()=>done(undefined);}));
  await mount();const confirm=await review();await act(async()=>confirm());
  await press("Use this working folder");
  if(kind==="access")state.allowed=false;
  await render(kind==="hidden"?{visible:false}:kind==="blocked"?{blocked:true}:{});
  if(kind==="hidden")await render();
  await act(async()=>resolve());
  expect(state.select).not.toHaveBeenCalled();expect(state.closed).not.toHaveBeenCalled();
  state.allowed=true;await render();expect(container.textContent).toContain("/created");
});

it("lets a known refusal retry but latches a malformed successful response",async()=>{
  state.write.mockRejectedValueOnce(new Error("Branch refused"));
  await mount();let confirm=await review();await act(async()=>confirm());
  expect(container.textContent).toContain("Branch refused");
  state.write.mockResolvedValueOnce({path:"/unverified",branch:"wrong"});
  confirm=await review();await act(async()=>confirm());
  expect(container.textContent).toContain("The create result is uncertain");
  await press("Refresh working folders");await act(async()=>confirm());
  expect(state.write).toHaveBeenCalledTimes(2);expect(state.select).not.toHaveBeenCalled();
});

it("shows identical read failures once and distinct failures separately",async()=>{
  state.error=new Error("Same failure");state.treeError=new Error("Same failure");
  await mount();expect(container.textContent!.split("Same failure")).toHaveLength(2);
  state.treeError=new Error("Tree failure");await render();
  expect(container.textContent).toContain("Same failure");expect(container.textContent).toContain("Tree failure");
});

it("prioritizes the actual access failure when the other read has a network error",async()=>{
  await mount();
  state.error=Object.assign(new Error("Network failure"),{kind:"network"});
  state.treeError=Object.assign(new Error("Worktree permission expired"),{kind:"auth"});
  await render();expect(container.textContent).toContain("Worktree permission expired");
  expect(container.textContent).not.toContain("Network failure");
  expect(container.textContent).not.toContain("Original computer");
});
