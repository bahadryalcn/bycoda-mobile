// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { InboxScreen } from "./inbox-screen";
import { createInboxBrowseMemory } from "../inbox/inbox-browse-memory";
import { RemoteHostError } from "@/remote/host-error";
import type { MobileInboxItem } from "@/domain/types";
const origin={machineId:"machine",projectId:"project"};
const state=vi.hoisted(()=>({active:"machine",project:"project",hasMachine:true,enabled:true,paused:false,error:null as Error|null,
 external:false,actions:[] as Array<{key:string;onPress:()=>void}>,rows:[] as MobileInboxItem[],select:vi.fn(),push:vi.fn(),refetch:vi.fn(),reads:[] as boolean[],presses:new Map<string,()=>void>(),
 memory:null as ReturnType<typeof createInboxBrowseMemory>|null,bindings:null as any,scroll:vi.fn()}));
vi.mock("@/ui/icon-tile", () => ({ IconTile: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("lucide-react-native/icons/circle-check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/circle-help", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/eye", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/git-pull-request", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/shield-check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/triangle-alert", () => ({ default: () => null }));
vi.mock("expo-router",()=>({router:{navigate:state.push},useLocalSearchParams:()=>({})}));
vi.mock("expo-localization",()=>({getLocales:()=>[{languageTag:"en-US"}]}));
vi.mock("react-native",()=>({View:({children}:PropsWithChildren)=>createElement("div",null,children)}));
vi.mock("@/ui/search-field",()=>({CollectionToolbar:({field,actions}:any)=>createElement("section",null,field,actions)}));
vi.mock("@/ui/styles",()=>({uiStyles:{caption:{}}}));
vi.mock("@/ui/copy",()=>({useCopy:()=>(_tr:string,en:string)=>en}));
vi.mock("@/state/machines",()=>({useActiveMachine:()=>state.hasMachine?{id:state.active}:undefined,
 useMachines:Object.assign((selector:any)=>selector({selectedProjectId:state.project,selectProject:state.select}),{getState:()=>({activeId:state.active,selectedProjectId:state.project,language:"en"})})}));
vi.mock("@/state/queries",()=>({useHostQuery:(_key:unknown,_method:unknown,_params:unknown,options:{enabled:boolean})=>{
 state.reads.push(options.enabled);return{data:{items:state.rows,externalProviderInboxAvailable:state.external},isEnabled:state.enabled,fetchStatus:state.paused?"paused":"idle",error:state.error,refetch:state.refetch};
}}));
vi.mock("./shared/scope",()=>({Scope:()=>null}));
vi.mock("./shared/status",()=>({Status:({value}:{value:string})=>createElement("span",null,value),statusLabel:(value:string)=>value}));
vi.mock("../inbox/provider-inbox-screen",()=>({ProviderInboxScreen:()=>createElement("p",null,"Provider mode")}));
vi.mock("../inbox/inbox-browse-memory-provider",()=>({InboxBrowseMemoryProvider:({children}:PropsWithChildren)=>children,useInboxBrowseMemory:()=>state.memory}));
// The row is presentation; these tests cover the screen's scope, routing and retirement rules.
vi.mock("../inbox/attention-row",()=>({AttentionRow:({item,onPress}:{item:{title:string};onPress:()=>void})=>{state.presses.set(item.title,onPress);return createElement("button",{onClick:onPress},item.title);}}));
vi.mock("@/ui/primitives",()=>{
 const Wrap=({children}:PropsWithChildren)=>createElement("div",null,children);
 const Button=({label,onPress}:any)=>createElement("button",{onClick:onPress},label);
 return{Button,Body:Wrap,Row:Wrap,SectionHeader:({title}:{title:string})=>createElement("h3",null,title),Badge:({label}:{label:string})=>createElement("span",null,label),
 ActionMenu:({actions}:any)=>{state.actions=actions.filter(Boolean);return createElement("div",null,...state.actions.map(a=>createElement("button",{key:a.key,onClick:a.onPress},a.key)));},
 Sheet:({visible,children,onClose}:any)=>visible?createElement("aside",null,children,createElement("button",{onClick:onClose},"Close help")):null,Screen:Wrap,ScreenHeader:Wrap,StateView:({title,description}:{title:string;description?:string})=>createElement("p",null,title,description),
 QueryState:({query}:{query:{error?:Error}})=>query.error?createElement("p",null,query.error.message):null,
 SegmentedControl:({options,onChange}:{options:Array<{label:string;value:string}>;onChange:(value:string)=>void})=>createElement("nav",null,...options.map(o=>createElement("button",{key:o.value,onClick:()=>onChange(o.value)},o.label))),
 NavigationRow:({label,onPress,supporting}:{label:string;onPress:()=>void;supporting:unknown})=>{state.presses.set(label,onPress);return createElement("button",{onClick:onPress},label,supporting as never);},
 };
});
vi.mock("@/ui/screen-list",()=>({ScreenList:(props:any)=>{state.bindings=props;if(props.ref)props.ref.current={scrollToOffset:state.scroll};return createElement("main",{"data-count":props.data.length},props.context,props.header,...props.data.map((item:MobileInboxItem,index:number)=>createElement("div",{key:item.id},props.renderItem({item,index}))));}}));
const row={id:"record-1",title:"Original attention target",kind:"session",sessionId:"session-7",projectId:"target-project",detail:"Original detail",status:"review",updatedAt:Date.UTC(2026,10,3)} as MobileInboxItem;
let root:ReturnType<typeof createRoot>|undefined,host:HTMLDivElement;
async function render(){await act(async()=>root!.render(createElement(InboxScreen)));}
async function mount(){vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);state.memory=createInboxBrowseMemory(origin);state.rows=[row];state.select.mockImplementation(id=>{state.project=id;});host=document.createElement("div");document.body.append(host);root=createRoot(host);await render();}
async function press(){await act(async()=>state.presses.get(row.title)!());}
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;host?.remove();state.external=false;state.actions=[];state.active="machine";state.project="project";state.hasMachine=true;state.enabled=true;state.paused=false;state.error=null;state.rows=[];state.reads=[];state.memory=null;state.bindings=null;state.presses.clear();vi.clearAllMocks();vi.unstubAllGlobals();});
it("validates the opening scope before intentional project selection and opens the exact original session",async()=>{
 await mount();await press();expect(state.select).toHaveBeenCalledExactlyOnceWith("target-project");expect(state.push).toHaveBeenCalledExactlyOnceWith({pathname:"/session/[id]",params:{id:"session-7",machineId:"machine",projectId:"target-project"}});
 expect(state.select.mock.invocationCallOrder[0]).toBeLessThan(state.push.mock.invocationCallOrder[0]!);
});
it.each([["task","tasks"],["goal","goals"],["automation","automations"],["pull-request","tasks"],["session","inbox"]] as const)("preserves the %s management destination",async(kind,destination)=>{
 await mount();state.rows=[{...row,kind,sessionId:undefined,projectId:undefined}];await render();await press();expect(state.select).not.toHaveBeenCalled();expect(state.push).toHaveBeenCalledExactlyOnceWith(`/manage/${destination}`);
});
it("hides social attention without opening an unavailable screen",async()=>{
 await mount();state.rows=[{...row,kind:"social",sessionId:undefined}];await render();
 expect(host.textContent).not.toContain(row.title);expect(state.push).not.toHaveBeenCalled();
});
it.each(["machine","project"])("rejects a retained row immediately after live %s changes, before React rerenders",async(kind)=>{
 await mount();const old=state.presses.get(row.title)!;if(kind==="machine")state.active="other";else state.project="other";await act(async()=>old());expect(state.select).not.toHaveBeenCalled();expect(state.push).not.toHaveBeenCalled();
});
it.each(["auth","identity","disabled","paused"])("conceals retained DTOs and retires the old row across %s loss and restoration",async(kind)=>{
 await mount();const old=state.presses.get(row.title)!;
 if(kind==="auth"||kind==="identity")state.error=new RemoteHostError("machine",kind,"Attention access unavailable");if(kind==="disabled")state.enabled=false;if(kind==="paused")state.paused=true;await render();
 expect(host.querySelector("main")!.getAttribute("data-count")).toBe("0");expect(host.textContent).not.toContain(row.title);await act(async()=>old());expect(state.select).not.toHaveBeenCalled();
 state.error=null;state.enabled=true;state.paused=false;await render();await act(async()=>old());expect(state.push).not.toHaveBeenCalled();await press();expect(state.push).toHaveBeenCalledOnce();
});
it("rejects a retired memory port even when the IDs have returned before rerender",async()=>{
 await mount();const old=state.presses.get(row.title)!,refresh=state.bindings.refresh;state.memory!.retire();await act(async()=>{old();refresh();});expect(state.push).not.toHaveBeenCalled();expect(state.select).not.toHaveBeenCalled();expect(state.refetch).not.toHaveBeenCalled();
});
it.each(["removed","retargeted"])("rejects a %s record after a refreshed snapshot",async(kind)=>{
 await mount();const old=state.presses.get(row.title)!;state.rows=kind==="removed"?[]:[{...row,sessionId:"different-session"}];await render();await act(async()=>old());expect(state.push).not.toHaveBeenCalled();expect(state.select).not.toHaveBeenCalled();
});
it("keeps authorized network data and permits repair on the original scope",async()=>{
 await mount();state.error=Error("Network unavailable");await render();expect(host.textContent).toContain(row.title);await act(async()=>state.bindings.refresh());expect(state.refetch).toHaveBeenCalledOnce();await press();expect(state.push).toHaveBeenCalledOnce();
});
it("preserves the Attention position through concealment without changing provider position",async()=>{
 await mount();state.memory!.scroll(origin,135);await act(async()=>{state.bindings.onLayout({nativeEvent:{layout:{height:300}}});state.bindings.onContentSizeChange(320,3000);state.bindings.onScroll({nativeEvent:{contentOffset:{y:1000}}});});
 state.error=new RemoteHostError("machine","auth","Access unavailable");await render();await act(async()=>{state.bindings.onContentSizeChange(320,100);state.bindings.onScroll({nativeEvent:{contentOffset:{y:0}}});});expect(state.memory!.attention.read(origin)?.offset).toBe(1000);
 state.error=null;await render();await act(async()=>{state.bindings.onContentSizeChange(320,3000);state.bindings.onScroll({nativeEvent:{contentOffset:{y:1000}}});});expect(state.scroll).toHaveBeenLastCalledWith({offset:1000,animated:false});expect(state.memory!.read(origin)?.offset).toBe(135);
});
it("retires row and refresh callbacks on mode unmount",async()=>{
 await mount();const old=state.presses.get(row.title)!,refresh=state.bindings.refresh;await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="Issues & PRs")!.click());await act(async()=>{old();refresh();});expect(state.push).not.toHaveBeenCalled();expect(state.select).not.toHaveBeenCalled();expect(state.refetch).not.toHaveBeenCalled();
});
it("shows computer recovery without reading or navigating when no machine is selected",async()=>{
 await mount();state.hasMachine=false;await render();expect(host.textContent).toContain("Choose a computer");expect(host.querySelector("main")!.getAttribute("data-count")).toBe("0");expect(state.reads.at(-1)).toBe(false);
});

it("opens reachable secondary help without a permanent help row and retains refresh",async()=>{
 await mount();expect(host.querySelector("aside")).toBeNull();await act(async()=>state.actions.find(a=>a.key==="help")!.onPress());
 expect(host.querySelector("aside")!.textContent).toContain("GitHub, GitLab, Jira, Linear and Azure");
 await act(async()=>host.querySelector("aside button")!.dispatchEvent(new MouseEvent("click",{bubbles:true})));expect(host.querySelector("aside")).toBeNull();
 await act(async()=>state.actions.find(a=>a.key==="refresh")!.onPress());expect(state.refetch).toHaveBeenCalledOnce();
});
it("retires open help and its trigger across access loss and restoration",async()=>{
 await mount();const old=state.actions.find(a=>a.key==="help")!.onPress;await act(async()=>old());expect(host.querySelector("aside")).not.toBeNull();
 state.error=new RemoteHostError("machine","auth","Access unavailable");await render();expect(host.querySelector("aside")).toBeNull();
 state.error=null;await render();await act(async()=>old());expect(host.querySelector("aside")).toBeNull();
 await act(async()=>state.actions.find(a=>a.key==="help")!.onPress());expect(host.querySelector("aside")).not.toBeNull();
});
it("omits external-provider guidance when that inbox is already available",async()=>{
 state.external=true;await mount();expect(state.actions.map(a=>a.key)).toEqual(["refresh"]);
});
