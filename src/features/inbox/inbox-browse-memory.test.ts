import { expect, it } from "vitest";
import { defaultInboxView } from "./provider-view-model";
import { createInboxBrowseMemory, createInboxBrowseScope } from "./inbox-browse-memory";
import { initialInboxBrowseState } from "./provider-state";
const origin={machineId:"computer",projectId:"project"};
const machine={id:"computer",endpoint:"https://one.invalid",environmentId:"environment",lanKey:"transport-metadata",name:"Computer"} as any;
it("remembers only list presentation, never an item, notice or approval",()=>{
 const memory=createInboxBrowseMemory(origin);
 memory.remember(origin,{...initialInboxBrowseState,search:"pending text",committedSearch:"older text",assigned:false,all:true,limit:80,selected:{title:"Private item"} as any,notice:"Saved"});
 memory.scroll(origin,420);
 expect(memory.read(origin)).toEqual({preferences:{search:"pending text",committedSearch:"older text",assigned:false,all:true,limit:80,view:defaultInboxView},offset:420});
 expect(Object.keys(memory.read(origin)!.preferences)).not.toContain("selected");
});
it("rejects another origin, invalid offsets and retired callbacks",()=>{
 const memory=createInboxBrowseMemory(origin);memory.scroll(origin,120);
 for(const offset of [-1,NaN,Infinity])memory.scroll(origin,offset);
 memory.scroll({...origin,projectId:"other"},800);expect(memory.read(origin)!.offset).toBe(120);
 expect(memory.read({...origin,machineId:"other"})).toBeUndefined();
 memory.retire();memory.remember(origin,initialInboxBrowseState);memory.scroll(origin,300);expect(memory.read(origin)).toBeUndefined();
});
it("keeps Attention and provider positions independent under the same reviewed scope",()=>{
 const memory=createInboxBrowseMemory(origin);
 memory.scroll(origin,420);memory.attention.scroll(origin,850);
 const first=memory.attention.read(origin)!;
 expect(first).toEqual({offset:850});expect(Object.isFrozen(first)).toBe(true);
 memory.remember(origin,{...initialInboxBrowseState,search:"Provider search"});
 memory.scroll(origin,600);
 expect(memory.attention.read(origin)).toBe(first);
 for(const offset of [-1,NaN,Infinity])memory.attention.scroll(origin,offset);
 memory.attention.scroll({...origin,projectId:"other"},999);
 expect(memory.attention.read(origin)).toBe(first);
 expect(memory.attention.read({...origin,machineId:"other"})).toBeUndefined();
 memory.attention.scroll(origin,920);expect(memory.read(origin)!.offset).toBe(600);
 expect(memory.attention.read(origin)).toEqual({offset:920});
 memory.retire();memory.attention.scroll(origin,1);
 expect(memory.attention.read(origin)).toBeUndefined();expect(memory.read(origin)).toBeUndefined();
});
it("keeps metadata churn but retires same-ID re-pairing, project changes and A/B/A epochs",()=>{
 const owner=createInboxBrowseScope(),first=owner.sync(machine,"project");first.memory.remember(origin,{...initialInboxBrowseState,search:"Keep"});first.memory.attention.scroll(origin,850);
 expect(owner.sync({...machine,name:"Renamed"},"project")).toBe(first);
 const second=owner.sync({...machine,endpoint:"https://two.invalid"},"project");
 const returned=owner.sync(machine,"project");expect(returned.generation).toBeGreaterThan(second.generation);
 expect(first.memory.read(origin)).toBeUndefined();expect(returned.memory.read(origin)!.preferences.search).toBe("");
 expect(first.memory.attention.read(origin)).toBeUndefined();expect(returned.memory.attention.read(origin)).toEqual({offset:0});
 const project=owner.sync(machine,"other");expect(returned.memory.read(origin)).toBeUndefined();
 expect(project.memory.read({...origin,projectId:"other"})!.offset).toBe(0);
 expect(returned.memory.attention.read(origin)).toBeUndefined();expect(project.memory.attention.read({...origin,projectId:"other"})).toEqual({offset:0});
});

it.each(["endpoint","environmentId","lanKey","id"] as const)("retires both view ports when the reviewed %s changes",field=>{
 const owner=createInboxBrowseScope(),first=owner.sync(machine,"project");
 first.memory.attention.scroll(origin,850);first.memory.scroll(origin,420);
 const nextMachine={...machine,[field]:"changed"};
 const next=owner.sync(nextMachine,"project"),nextOrigin={machineId:nextMachine.id,projectId:"project"};
 expect(first.memory.attention.read(origin)).toBeUndefined();expect(first.memory.read(origin)).toBeUndefined();
 expect(next.memory.attention.read(nextOrigin)).toEqual({offset:0});expect(next.memory.read(nextOrigin)!.offset).toBe(0);
});
