// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const fixture=vi.hoisted(()=>({state:{activeId:"computer",selectedProjectId:"project",machines:[{id:"computer",endpoint:"https://one.invalid",name:"Computer"}]} as any,listeners:new Set<()=>void>()}));
vi.mock("@/state/machines",()=>({useMachines:Object.assign((selector: (state: any) => unknown) => selector(fixture.state), {getState:()=>fixture.state,subscribe:(listener:()=>void)=>{fixture.listeners.add(listener);return()=>fixture.listeners.delete(listener);}})}));
import { InboxBrowseMemoryProvider, useInboxBrowseMemory } from "./inbox-browse-memory-provider";
import { useInboxLocalScope, type InboxLocalScope } from "./inbox-local-scope";
import { initialInboxBrowseState } from "./provider-state";
import type { InboxBrowseMemory } from "./inbox-browse-memory";
const origin={machineId:"computer",projectId:"project"};
let root:ReturnType<typeof createRoot>|undefined,memory:InboxBrowseMemory|null=null;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>{act(()=>root?.unmount());root=undefined;document.body.replaceChildren();fixture.listeners.clear();fixture.state={activeId:"computer",selectedProjectId:"project",machines:[{id:"computer",endpoint:"https://one.invalid",name:"Computer"}]};});
function Probe(){memory=useInboxBrowseMemory();return createElement("p",null,memory?.read(origin)?.preferences.search);}
function update(patch:any){fixture.state={...fixture.state,...patch};for(const listener of fixture.listeners)listener();}
it("retains preferences across conditional mode mounts and observes batched A/B/A store events",()=>{
 const host=document.createElement("div");document.body.append(host);root=createRoot(host);
 const render=(shown:boolean)=>act(()=>root!.render(createElement(InboxBrowseMemoryProvider,null,shown?createElement(Probe):null)));
 render(true);const first=memory!;first.remember(origin,{...initialInboxBrowseState,search:"Keep search"});first.attention.scroll(origin,850);
 render(false);render(true);expect(memory).toBe(first);expect(host.textContent).toBe("Keep search");
 expect(memory!.attention.read(origin)).toEqual({offset:850});
 const before=host.querySelector("p");act(()=>update({machines:[{...fixture.state.machines[0],name:"Renamed"}]}));expect(host.querySelector("p")).toBe(before);
 act(()=>{update({machines:[{id:"computer",endpoint:"https://two.invalid"}]});update({machines:[{id:"computer",endpoint:"https://one.invalid"}]});});
 expect(memory).not.toBe(first);expect(first.read(origin)).toBeUndefined();expect(host.textContent).toBe("");expect(host.querySelector("p")).not.toBe(before);
 expect(first.attention.read(origin)).toBeUndefined();expect(memory!.attention.read(origin)).toEqual({offset:0});
});
it("does not retire current preferences during StrictMode subscription replay",()=>{
 const host=document.createElement("div");document.body.append(host);root=createRoot(host);
 act(()=>root!.render(createElement(StrictMode,null,createElement(InboxBrowseMemoryProvider,null,createElement(Probe)))));
 memory!.remember(origin,{...initialInboxBrowseState,search:"Retained"});expect(memory!.read(origin)!.preferences.search).toBe("Retained");expect(fixture.listeners.size).toBe(1);
});


it("changes the Inbox filter without changing the workspace and retires captured scope even after A/B/A", () => {
 let local: InboxLocalScope;
 function LocalProbe() { local = useInboxLocalScope(); return null; }
 const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
 act(() => root!.render(createElement(InboxBrowseMemoryProvider, null, createElement(LocalProbe))));
 const captured = local!;
 expect(captured.matches(origin)).toBe(true);
 act(() => { captured.setProjectId("other"); captured.setProjectId("project"); });
 expect(fixture.state.selectedProjectId).toBe("project");
 expect(captured.matches(origin)).toBe(false);
 expect(local!.matches(origin)).toBe(true);
});
