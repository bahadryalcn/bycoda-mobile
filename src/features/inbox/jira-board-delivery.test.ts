// @vitest-environment happy-dom
import { act,createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach,expect,it,vi } from "vitest";
import { useJiraBoardDelivery } from "./jira-board-delivery";
import { InboxJobError } from "./provider-jobs";
const state=vi.hoisted(()=>({records:new Map<string,string>(),next:0,environmentId:"env",active:"machine",project:"project",job:vi.fn(),request:vi.fn(),saveFails:false}));
vi.mock("expo-crypto",()=>({randomUUID:()=>`jira-attempt-${++state.next}`}));
vi.mock("@react-native-async-storage/async-storage",()=>({default:{getItem:async(key:string)=>state.records.get(key)??null,setItem:async(key:string,value:string)=>{if(state.saveFails)throw new Error("Storage failed");state.records.set(key,value);},removeItem:async(key:string)=>{state.records.delete(key);}}}));
vi.mock("@/state/queries",()=>({useHostClient:()=>client}));
vi.mock("@/state/machines",()=>({useMachines:{getState:()=>({activeId:state.active,selectedProjectId:state.project,machines:[client.machine]})}}));
vi.mock("./provider-jobs",async original=>({...await original<typeof import("./provider-jobs")>(),runInboxJob:(...args:unknown[])=>state.job(...args)}));
const client={machine:{id:"machine",get environmentId(){return state.environmentId;},capabilities:["inbox.jiraBoard.v1"]},request:state.request};
const origin={machineId:"machine",projectId:"project"};
const command={action:"jira-board-transition" as const,input:{projectId:"project",snapshotId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",key:"ENG-7",transitionId:"4",confirm:"CHANGE_JIRA_BOARD" as const}};
let hook:ReturnType<typeof useJiraBoardDelivery>,root:ReturnType<typeof createRoot>;const container=document.createElement("div");
function Harness(){hook=useJiraBoardDelivery(origin,7);return null;}
async function mount(){vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);root=createRoot(container);await act(async()=>root.render(createElement(Harness)));}
async function unmount(){await act(async()=>root.unmount());}
afterEach(async()=>{await unmount();state.records.clear();state.next=0;state.environmentId="env";state.active="machine";state.project="project";state.saveFails=false;vi.resetAllMocks();vi.unstubAllGlobals();});
it("persists exact native intent before transport and reopens an unknown action using only its original receipt",async()=>{
 state.job.mockImplementation(async(_client,input,_signal,id)=>{const saved=JSON.parse([...state.records.values()][0]!);expect(saved.pending.command).toEqual(command);expect(saved.pending.requestId).toBe(id);throw new InboxJobError("Lost response",true);});
 await mount();await act(async()=>hook.submit(command));expect(hook.draft.value?.pending?.requestId).toBe("jira-attempt-1");expect(state.job).toHaveBeenCalledTimes(1);
 await unmount();state.request.mockClear();state.request.mockResolvedValue({id:"host-job",state:"completed",result:{outcome:"submitted"}});await mount();
 expect(state.request).toHaveBeenCalledExactlyOnceWith("inbox.provider.result",{requestId:"jira-attempt-1"});expect(state.job).toHaveBeenCalledTimes(1);expect(hook.result).toEqual({outcome:"submitted"});expect(hook.draft.value?.pending).toBeUndefined();
});
it("settles only typed native no-write proof; malformed results and replacement computers keep the guard",async()=>{
 state.job.mockResolvedValue({outcome:"not-submitted",reason:"Owner declined before provider dispatch"});await mount();await act(async()=>hook.submit(command));
 expect(hook.result).toEqual({outcome:"not-submitted",reason:"Owner declined before provider dispatch"});expect(hook.draft.value?.pending).toBeUndefined();
 await unmount();state.job.mockRejectedValue(new InboxJobError("Unknown",true));await mount();await act(async()=>hook.submit(command));await unmount();
 state.request.mockResolvedValue({id:"host-job",state:"completed",result:{approved:false}});await mount();expect(hook.draft.value?.pending).toBeDefined();expect(hook.result).toBeNull();
 await unmount();state.environmentId="replacement";state.request.mockClear();await mount();expect(state.request).not.toHaveBeenCalled();expect(hook.draft.value?.pending).toBeDefined();
});
it("never dispatches through a stale project or failed durable storage",async()=>{
 await mount();state.project="other";await act(async()=>hook.submit(command));expect(state.job).not.toHaveBeenCalled();
 state.project="project";state.saveFails=true;await act(async()=>hook.submit(command));expect(state.job).not.toHaveBeenCalled();expect(hook.draft.value?.pending).toBeUndefined();
});
