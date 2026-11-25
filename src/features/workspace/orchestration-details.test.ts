// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { Block } from "@/domain/types";
import { OrchestrationDetails } from "./orchestration-details";
const state=vi.hoisted(()=>({allowed:true,epoch:true,activeId:"m",contexts:new Map<string,unknown>(),commands:new Map<string,()=>void>(),closed:vi.fn()}));
vi.mock("@/state/machines",()=>({useMachines:Object.assign((selector:any)=>selector({machines:[{id:"m",name:"Original computer"}]}),{getState:()=>({activeId:state.activeId})})}));
vi.mock("@/state/connection-scope",()=>{const scope={isCurrent:()=>state.epoch};return{useConnectionScope:()=>scope};});
vi.mock("@/ui/private-access",()=>({usePrivateContentAccess:()=>({allowed:state.allowed,check:()=>state.allowed}),PrivateContentAccessProvider:({children}:PropsWithChildren)=>children}));
vi.mock("@/ui/copy",()=>({useCopy:()=> (_tr:string,en:string,values?:Record<string,string|number>)=>en.replace(/\{p0\}/g,String(values?.p0??""))}));
vi.mock("@/ui/confirm",()=>({confirmAction:vi.fn()}));
vi.mock("@/ui/message-text",()=>({MessageText:({text,context}:any)=>{state.contexts.set(text,context);return createElement("p",null,text);}}));
vi.mock("@/ui/search-field",()=>({CollectionToolbar:({field,actions}:any)=>createElement("header",null,field,actions)}));
vi.mock("@/ui/primitives",()=>{
 const content=({children}:any)=>createElement("div",null,children);
 const button=({label,onPress}:any)=>{state.commands.set(label,onPress);return createElement("button",{onClick:onPress},label);};
 return{Body:content,Stack:content,Row:content,Badge:({label}:any)=>createElement("span",null,label), StatusText: ({label}:any)=>createElement("span",null,label),Notice:({message}:any)=>createElement("p",null,message), StateView: ({ title }:any) => createElement("p",null,title),Sheet:({title,children}:any)=>createElement("article",{"aria-label":title},children),NavigationRow:button,
 FormActions:({submitLabel,onSubmit}:any)=>button({label:submitLabel,onPress:onSubmit}),ActionMenu:({actions}:any)=>createElement("nav",null,...actions.map((action:any)=>createElement("section",{key:action.key},button(action))))};
});
vi.mock("@/ui/screen-list",()=>({ScreenList:({data,renderItem,header,footer,ListEmptyComponent}:any)=>createElement("main",null,header,...data.map((item:any,index:number)=>createElement("section",{key:index},renderItem({item}))),data.length?null:ListEmptyComponent,footer)}));
const block = { id: "proposal", role: "plan", text: "", orchestration: {
    version: 1, leadId: "lead", cwd: "/project", checkoutCwd: "/worktree", title: "Implementation", summary: "Summary",
    request: "Original request", author: { harness: "claude", model: "model", name: "Model" }, status: "ready",
    settings: { maxWorkers: 2, choices: [{ harness: "claude", model: "worker", name: "Worker" }] },
    tasks: [{ id: "a", title: "Inspect", harness: "claude", model: "worker", prompt: "Inspect source", files: ["src/a.ts"], dependsOn: [] },
      { id: "b", title: "Implement", harness: "claude", model: "worker", prompt: "Apply change", files: ["src/b.ts"], dependsOn: ["a"], modelSettings: { effort: "high" } }],
  } } as Block;
const container=document.createElement("div");let root:ReturnType<typeof createRoot>;
async function render(overrides:Partial<React.ComponentProps<typeof OrchestrationDetails>>={}){await act(async()=>root.render(createElement(OrchestrationDetails,{block,scope:{machineId:"m",sessionId:"lead"},onClose:state.closed,...overrides})));}
async function mount(){vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);root=createRoot(container);await render();}
async function press(label:string){await act(async()=>state.commands.get(label)!());}
afterEach(async()=>{await act(async()=>root?.unmount());state.allowed=true;state.epoch=true;state.activeId="m";state.commands.clear();state.contexts.clear();vi.clearAllMocks();vi.unstubAllGlobals();});

it("keeps full request, summary and task bodies out of the main list",async()=>{await mount();expect(container.textContent).toContain("Original computer");expect(container.textContent).toContain("Implement");expect(container.textContent).not.toContain("Original request");expect(container.textContent).not.toContain("Apply change");expect(container.querySelectorAll("input,textarea")).toHaveLength(0);});
it.each(["Request","Summary"])("opens complete %s text only on explicit navigation",async(label)=>{await mount();await press(label);expect(container.querySelector("article")!.textContent).toContain(label==="Request"?"Original request":"Summary");await press("Close");expect(container.querySelector("article")).toBeNull();expect(state.closed).not.toHaveBeenCalled();});
it("preserves exact checkout/parent, author, worker settings and choice identities",async()=>{await mount();await press("Details");for(const text of ["lead","/project","/worktree","Claude · model","Concurrent worker limit: 2","Worker","Claude · worker"])expect(container.querySelector("article")!.textContent).toContain(text);});
it("reads complete task scope/settings/prompt and follows an exact dependency without execution",async()=>{await mount();await press("Implement");for(const text of ["b","src/b.ts","effort: high","Inspect"])expect(container.querySelector("article")!.textContent).toContain(text);await press("Assignment");expect(container.querySelectorAll("article")).toHaveLength(2);expect(container.textContent).toContain("Apply change");await press("Close");await press("Inspect");expect(container.querySelector("article")!.textContent).toContain("src/a.ts");expect(container.querySelector("article")!.textContent).not.toContain("src/b.ts");expect(state.closed).not.toHaveBeenCalled();});
it("keeps unknown dependency IDs readable without inventing navigation",async()=>{await mount();const proposal=block.orchestration!;await render({block:{...block,orchestration:{...proposal,tasks:[{...proposal.tasks[0]!,dependsOn:["missing-task"]}]}}});await press("Inspect");expect(container.querySelector("article")!.textContent).toContain("missing-task");expect([...container.querySelectorAll("button")].some(button=>button.textContent==="missing-task")).toBe(false);});
it("retains the parent-ownership warning while allowing read-only inspection",async()=>{await mount();await render({scope:{machineId:"m",sessionId:"other"}});expect(container.textContent).toContain("Record access is unavailable");await act(async()=>root.unmount());root=createRoot(container);await render({block:{...block,orchestration:{...block.orchestration!,leadId:"foreign"}}});expect(container.textContent).toContain("This proposal belongs to another parent session.");await press("Inspect");expect(container.querySelector("article")).not.toBeNull();});
it("keeps an opened immutable reader through background proposal updates",async()=>{await mount();await press("Implement");await render({block:{...block,orchestration:{...block.orchestration!,summary:"Updated summary",tasks:block.orchestration!.tasks.map(task=>({...task,prompt:"Updated instructions"}))}}});expect(container.querySelector("article")).not.toBeNull();await press("Assignment");expect(container.textContent).toContain("Apply change");expect(container.textContent).not.toContain("Updated instructions");});
it("retains the opened document context instead of retargeting links during an update",async()=>{await mount();const client={} as any;await render({context:{client,machineId:"m",projectId:"original-project",cwd:"/project"}});await press("Request");await render({context:{client:{} as any,machineId:"m",projectId:"different-project",cwd:"/other"}});expect(state.contexts.get("Original request")).toEqual({client,machineId:"m",projectId:"original-project",cwd:"/project"});});
it.each(["access","epoch","active","machine","session","block","lead","cwd","checkout"])("conceals cached proposal and retires readers after %s change",async(kind)=>{await mount();await press("Implement");const oldAssignment=state.commands.get("Assignment")!;
 if(kind==="access")state.allowed=false;if(kind==="epoch")state.epoch=false;if(kind==="active")state.activeId="other";
 const proposal=block.orchestration!;await render(kind==="machine"?{scope:{machineId:"other",sessionId:"lead"}}:kind==="session"?{scope:{machineId:"m",sessionId:"other"}}:kind==="block"?{block:{...block,id:"other"}}:["lead","cwd","checkout"].includes(kind)?{block:{...block,orchestration:{...proposal,...(kind==="lead"?{leadId:"other"}:kind==="cwd"?{cwd:"/other"}:{checkoutCwd:"/other"})}}}:{});
 expect(container.textContent).not.toContain("src/b.ts");expect(container.querySelector("article")).toBeNull();state.allowed=true;state.epoch=true;state.activeId="m";await render();await act(async()=>oldAssignment());expect(container.querySelector("article")).toBeNull();
});
it("rejects a stale row callback after the task was removed",async()=>{await mount();const old=state.commands.get("Implement")!;await render({block:{...block,orchestration:{...block.orchestration!,tasks:[]}}});await act(async()=>old());expect(container.querySelector("article")).toBeNull();});
it("rejects a former reader's close after a new reader has opened",async()=>{await mount();await press("Request");const close=state.commands.get("Close")!;await press("Close");await press("Summary");await act(async()=>close());expect(container.querySelector("article")!.getAttribute("aria-label")).toBe("Summary");});
it("shows desktop controller guidance without any execution controls",async()=>{await mount();await press("Help");expect(container.querySelector("article")!.textContent).toContain("Manage this coordination's actions on your computer.");expect([...container.querySelectorAll("button")].some(button=>/^(Run|Start|Approve|Stop|Retry)$/.test(button.textContent!))).toBe(false);});
it("shows errors without hiding task inspection",async()=>{await mount();await render({block:{...block,orchestration:{...block.orchestration!,status:"invalid",error:"Proposal needs repair"}}});expect(container.textContent).toContain("Proposal needs repair");await press("Inspect");expect(container.querySelector("article")).not.toBeNull();});

it("keeps an unavailable proposal closable and retires its reader across a refresh", async () => {
  await mount();
  const oldRequest = state.commands.get("Request")!;
  await press("Request");
  expect(container.querySelector("article")?.textContent).toContain("Original request");

  await render({ block: { ...block, orchestration: undefined } });
  expect(container.textContent).toContain("Unavailable");
  expect(container.textContent).not.toContain("Original request");
  expect(container.querySelector("article")).toBeNull();
  expect([...container.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Close"]);
  await press("Close");
  expect(state.closed).toHaveBeenCalledOnce();

  await render();
  await act(async () => oldRequest());
  expect(container.querySelector("article")).toBeNull();
  await press("Request");
  expect(container.querySelector("article")?.textContent).toContain("Original request");
});

it("explains an empty readable task list without hiding the request or summary", async () => {
  await mount();
  await render({ block: { ...block, orchestration: { ...block.orchestration!, tasks: [] } } });
  expect(container.textContent).toContain("No tasks in this view");
  await press("Summary");
  expect(container.querySelector("article")?.textContent).toContain("Summary");

  state.allowed = false;
  await render({ block: { ...block, orchestration: { ...block.orchestration!, tasks: [] } } });
  expect(container.textContent).toContain("Record access is unavailable");
  expect(container.textContent).not.toContain("No tasks in this view");
});

it("ignores retained callbacks after unmount",async()=>{await mount();const open=state.commands.get("Request")!;await act(async()=>root.unmount());await act(async()=>open());expect(container.querySelector("article")).toBeNull();});
