// @vitest-environment happy-dom
import {act,createElement,type PropsWithChildren} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {DraftEditor} from "./draft-editor";
import {CampaignEditor} from "./campaign-editor";
import {RuleEditor} from "./rule-editor";

const fixture=vi.hoisted(()=>({
 machine:{id:"machine",endpoint:"https://one.invalid",environmentId:"environment",lanKey:"key"},
 listeners:new Set<()=>void>(),serial:0,fields:new Map<string,any>(),selects:new Map<string,any>(),
 actions:{} as any,time:{} as any,policyScope:{} as any,guard:vi.fn(),mutate:vi.fn(),fresh:vi.fn(),transport:vi.fn(),
}));
vi.mock("expo-crypto",()=>({randomUUID:()=>`editor-${++fixture.serial}`}));
vi.mock("@/state/machines",()=>({useMachines:{
 getState:()=>({activeId:fixture.machine.id,machines:[fixture.machine]}),
 subscribe:(notify:()=>void)=>{fixture.listeners.add(notify);return()=>fixture.listeners.delete(notify);},
}}));
vi.mock("@/ui/copy",()=>({useCopy:()=> (_tr:string,en:string)=>en}));
vi.mock("@/ui/motion",()=>({haptic:{success:vi.fn()}}));
vi.mock("@/ui/sheet-guard",()=>({useSheetGuard:(props:any)=>{fixture.guard(props);return{requestClose:vi.fn()};}}));
vi.mock("@/state/actions",()=>({useAsyncAction:()=>({isPending:false,run:(fn:()=>Promise<unknown>)=>fn()})}));
vi.mock("@/state/queries",()=>({useHostMutation:()=>({isPending:false,mutateAsync:fixture.mutate})}));
vi.mock("./policy",()=>({
 usePolicy:(_id:string,scope:any)=>{fixture.policyScope=scope;return{data:{effective:{}}};},
 freshPolicy:async()=>{await fixture.fresh();return{effective:{}};},PolicyInfo:()=>null,PolicyCounter:()=>null,
}));
vi.mock("./fact-choices",()=>({FactChoices:()=>null}));
vi.mock("./scheduled-time-field",()=>({ScheduledTimeField:(props:any)=>{fixture.time=props;return null;}}));
vi.mock("../shared/format",()=>({identifier:()=>"request"}));
vi.mock("@/ui/number-field", async () => ({ NumberField: (await import("@/ui/primitives")).Field }));
vi.mock("@/ui/primitives",()=>{
 const wrap=({children}:PropsWithChildren)=>createElement("div",null,children);
 return{Stack:wrap,Body:wrap,Card:wrap,Heading:wrap,Row:wrap,Section:wrap,
  Notice:({message}:any)=>createElement("p",null,message),ErrorText:()=>null,QueryState:()=>null,MutationState:()=>null,
  Field:(props:any)=>{fixture.fields.set(props.label,props);return createElement("input",{"aria-label":props.label,value:props.value,readOnly:props.editable===false,onChange:(event:any)=>props.onChangeText(event.target.value)});},
  SelectField:(props:any)=>{fixture.selects.set(props.label,props);return null;},
  FormActions:(props:any)=>{fixture.actions=props;return null;},
 };
});

let root:ReturnType<typeof createRoot>|undefined,host:HTMLDivElement;
beforeEach(()=>{
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
 fixture.machine={id:"machine",endpoint:"https://one.invalid",environmentId:"environment",lanKey:"key"};
 fixture.fields.clear();fixture.selects.clear();fixture.guard.mockClear();fixture.fresh.mockReset();fixture.transport.mockReset();
 fixture.mutate.mockReset().mockImplementation(async(_input:any,callbacks:any)=>{await fixture.transport();callbacks?.onSuccess?.({});return{};});
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root?.unmount());host.remove();vi.unstubAllGlobals();});
const variants=[{kind:"draft",Component:DraftEditor,field:"Text"},{kind:"campaign",Component:CampaignEditor,field:"Content name"},{kind:"rule",Component:RuleEditor,field:"Name"}] as const;
async function mount(c:typeof variants[number]){
 const profile={facts:[{id:"fact",topic:"workspace",text:"Original verified context"}]};
 const props:any=c.kind==="draft"?{draft:{id:"draft",accountId:"account",projectId:"project",contactId:"recipient",kind:"message",text:"Original",factIds:[],createdAt:1},profile,contextLabel:"Original account / project",onClose:vi.fn()}:
  {account:{id:"account",name:"Original account"},projectId:"project",projectLabel:"Original project",profile,onClose:vi.fn()};
 const render=()=>root!.render(createElement(c.Component as any,props));
 await act(async()=>render());
 await act(async()=>{
  fixture.fields.get(c.field).onChangeText("Submitted "+c.kind);
  if(c.kind==="campaign"){fixture.fields.get("Content").onChangeText("Submitted content");fixture.time.onChange("2026-12-01T10:00:00Z");}
  if(c.kind==="rule"){fixture.fields.get("Trigger phrase").onChangeText("workspace");fixture.selects.get("Verified facts").onChange("fact");fixture.selects.get("Reply mode").onChange("automatic");fixture.selects.get("Trigger").onChange("message");fixture.fields.get("Daily reply limit (1–100)").onChangeText("27");}
 });
 return{props,render};
}
function replace(){const original=fixture.machine;fixture.machine={...original,lanKey:"replacement"};fixture.listeners.forEach(notify=>notify());fixture.machine=original;fixture.listeners.forEach(notify=>notify());}

it.each(variants)("$kind keeps fields and blocks stale submit while workspace verification is unavailable",async c=>{
 const{props,render}=await mount(c);const submit=fixture.actions.onSubmit;
 props.available=false;await act(async()=>render());
 expect(fixture.actions.disabled).toBe(true);expect(fixture.policyScope.enabled).toBe(false);
 expect(fixture.fields.get(c.field).value).toBe("Submitted "+c.kind);expect(fixture.fields.get(c.field).editable).toBe(false);
 await act(async()=>submit());expect(fixture.fresh).not.toHaveBeenCalled();expect(fixture.mutate).not.toHaveBeenCalled();
 props.available=true;await act(async()=>render());expect(fixture.fields.get(c.field).value).toBe("Submitted "+c.kind);
 expect(fixture.guard).toHaveBeenLastCalledWith(expect.objectContaining({dirty:true}));
});
it.each(variants)("$kind rejects a policy continuation after batched re-pairing and keeps its original context",async c=>{
 const{props,render}=await mount(c);let release!:()=>void;fixture.fresh.mockImplementation(()=>new Promise<void>(done=>{release=done;}));
 let pending!:Promise<unknown>;await act(async()=>{pending=fixture.actions.onSubmit();});
 await act(async()=>{replace();props.profile={facts:[{id:"other",topic:"other",text:"Replacement context"}]};props.contextLabel="Replacement account";if(props.account)props.account={id:"other",name:"Replacement account"};render();});
 const rejected=expect(pending).rejects.toThrow("computer connection changed");await act(async()=>{release();await rejected;});
 expect(fixture.mutate).not.toHaveBeenCalled();expect(props.onClose).not.toHaveBeenCalled();
 expect(host.textContent).toContain("Original account");expect(host.textContent).not.toContain("Replacement account");
 expect(fixture.fields.get(c.field).value).toBe("Submitted "+c.kind);expect(fixture.actions.disabled).toBe(true);
});
it.each(variants)("$kind retains input arriving after submission instead of closing it on success",async c=>{
 const{props}=await mount(c);let release!:()=>void;fixture.transport.mockImplementation(()=>new Promise<void>(done=>{release=done;}));
 let pending!:Promise<unknown>;await act(async()=>{pending=fixture.actions.onSubmit();});
 expect(fixture.mutate).toHaveBeenCalledTimes(1);
 await act(async()=>{fixture.fields.get(c.field).onChangeText("Newer local input");release();await pending;});
 expect(fixture.fields.get(c.field).value).toBe("Newer local input");expect(props.onClose).not.toHaveBeenCalled();
 expect(fixture.guard).toHaveBeenLastCalledWith(expect.objectContaining({dirty:true}));
 const payload=fixture.mutate.mock.calls[0][0].input;
 expect(c.kind==="draft"?payload.text:payload.name).toBe("Submitted "+c.kind);
 if(c.kind==="campaign")expect(payload.variants[0].scheduledAt).toBe(Date.parse("2026-12-01T10:00:00Z"));
 if(c.kind==="rule")expect(payload).toMatchObject({mode:"automatic",trigger:"message",dailyLimit:27,answers:[{keyword:"workspace",factId:"fact"}]});
});
it.each(variants)("$kind ignores an old connection's late success and keeps its draft dirty",async c=>{
 const{props}=await mount(c);let release!:()=>void;fixture.transport.mockImplementation(()=>new Promise<void>(done=>{release=done;}));
 let pending!:Promise<unknown>;await act(async()=>{pending=fixture.actions.onSubmit();});
 await act(async()=>replace());const rejected=expect(pending).rejects.toThrow("computer connection changed");
 await act(async()=>{release();await rejected;});
 expect(fixture.mutate).toHaveBeenCalledTimes(1);expect(props.onClose).not.toHaveBeenCalled();
 expect(fixture.fields.get(c.field).value).toBe("Submitted "+c.kind);expect(fixture.guard).toHaveBeenLastCalledWith(expect.objectContaining({dirty:true}));
});
it.each(variants)("$kind closes once after an unchanged draft is saved on the current connection",async c=>{
 const{props}=await mount(c);await act(async()=>fixture.actions.onSubmit());
 expect(fixture.mutate).toHaveBeenCalledTimes(1);expect(props.onClose).toHaveBeenCalledTimes(1);
});
it("keeps an invalid, uncommitted schedule instead of closing the content editor on an earlier success",async()=>{
 const{props}=await mount(variants[1]);let release!:()=>void;fixture.transport.mockImplementation(()=>new Promise<void>(done=>{release=done;}));
 let pending!:Promise<unknown>;await act(async()=>{pending=fixture.actions.onSubmit();});
 await act(async()=>{fixture.time.onValidityChange(false);release();await pending;});
 expect(props.onClose).not.toHaveBeenCalled();expect(fixture.guard).toHaveBeenLastCalledWith(expect.objectContaining({dirty:true}));
});
