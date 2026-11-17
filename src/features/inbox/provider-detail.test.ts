// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { ProviderInboxDetail } from "./provider-detail";
import { InboxJobError } from "./provider-jobs";
vi.mock("@/i18n",()=>({useLocale:()=>"tr"}));
vi.mock("lucide-react-native/icons/info",()=>({default:()=>null}));
const state = vi.hoisted(() => ({ active: "machine", project: "project", allowed: true, error: null as Error | null,
  reads: [] as Array<{action: string; enabled: boolean}>, detailsRetry: vi.fn(), threadRetry: vi.fn(), availabilityRetry: vi.fn(),
  job: vi.fn(), open: vi.fn(), confirms: [] as Array<()=>void>, changes: new Map<string,(value:string)=>void>(), presses: new Map<string,()=>void>() }));
vi.mock("@/remote/transport",async()=>({RemoteHostError:(await import("@/remote/host-error")).RemoteHostError}));
vi.mock("../workspace/shared",()=>({ErrorText:()=>null}));
vi.mock("../management/shared/format",()=>({stamp:(value:string)=>value}));
vi.mock("@/ui/styles",()=>({uiStyles:{label:{},grow:{},caption:{}}}));
vi.mock("expo-router",()=>({router:{push:vi.fn()}}));
vi.mock("expo-crypto",()=>({randomUUID:()=>"synthetic-request"}));
vi.mock("react-native",()=>({Linking:{openURL:state.open}}));
vi.mock("@/state/machines",()=>({useMachines:{getState:()=>({activeId:state.active,selectedProjectId:state.project})}}));
vi.mock("@/state/queries",()=>({useHostClient:()=>({machine:{id:"machine",environmentId:"original-env",capabilities:["inbox.review.v1"]}}),hostKey:(id:string,key:unknown)=>[id,key]}));
vi.mock("@/ui/copy",()=>({useCopy:()=>(_tr:string,en:string,params?:Record<string,string|number>)=>en.replace(/\{(\w+)\}/g,(key,name:string)=>String(params?.[name]??key))}));
vi.mock("@/ui/confirm",()=>({confirmAction:(_title:string,_body:string,_label:string,confirm:()=>void)=>state.confirms.push(confirm)}));
vi.mock("@/ui/sheet-guard",()=>({useSheetGuard:({onClose}:{onClose:()=>void})=>({requestClose:onClose,requestCloseThen:(action:()=>void)=>action()})}));
vi.mock("@/ui/message-text",()=>({MessageText:({text}:{text:string})=>createElement("p",null,text)}));
vi.mock("./provider-pr-review",()=>({ProviderPrReview:()=>null}));
vi.mock("../pull-requests/ui/metadata",()=>({PullRequestMetadata:()=>null}));
vi.mock("./provider-reactions",()=>({ProviderReactions:()=>null}));
vi.mock("./provider-jobs",async()=>({...await vi.importActual("./provider-jobs"),runInboxJob:state.job}));
const details={body:"Private description",author:"Private author",headRefName:"private-feature",baseRefName:"private-main"};
const comment={id:"comment-1",threadId:"thread-1",author:"Private commenter",body:"Private conversation",createdAt:"2026-11-03T00:00:00Z",replies:[]};
vi.mock("./provider-queries",()=>({useInboxRead:({action}:{action:string},enabled:boolean)=>{
  state.reads.push({action,enabled});return {data:action==="details"?details:action==="review-context"?{headOid:"a".repeat(40)}:{comments:[comment],truncated:false},error:state.error,isSuccess:!state.error,isFetching:false,
    refetch:action==="details"?state.detailsRetry:state.threadRetry};
}}));
vi.mock("@/ui/dialogs",async()=>{const ui=await import("@/ui/primitives");return {Sheet:ui.Sheet,FormActions:ui.FormActions};});
vi.mock("@/ui/primitives",()=>{
  const Wrap=({children}:PropsWithChildren)=>createElement("div",null,children);
  const Button=({label,disabled,busy,onPress}:{label:string;disabled?:boolean;busy?:boolean;onPress:()=>void})=>{state.presses.set(label,onPress);return createElement("button",{disabled:disabled||busy,onClick:onPress},label);};
  return {Body:Wrap,Heading:Wrap,Stack:Wrap,Row:Wrap,Card:Wrap,Section:Wrap,Disclosure:Wrap,Button,ToggleField:()=>null,
    SectionHeader:({title}:{title:string})=>createElement("h2",null,title),
    IconButton:Button,
    ScreenList:({header,data,renderItem}: {header:unknown;data:unknown[];renderItem:(row:{item:unknown})=>unknown})=>
      createElement("section",{"data-conversation-list":true},header as never,...data.map((item,index)=>createElement("div",{key:index},renderItem({item}) as never))),
    Badge:({label}:{label:string})=>createElement("span",null,label),
    Screen:({children,refresh}:PropsWithChildren<{refresh:()=>void}>)=>createElement("main",null,createElement(Button,{label:"Refresh",onPress:refresh}),children),
    Sheet:({children,visible,title,onClose}:PropsWithChildren<{visible:boolean;title:string;onClose:()=>void}>)=>visible?createElement("aside",{"aria-label":title},children,createElement(Button,{label:"Close composer",onPress:onClose})):null,
    Notice:({message}:{message:string})=>createElement("p",null,message),
    QueryState:({query}:{query:{error?:Error;refetch:()=>void}})=>query.error?createElement("section",null,query.error.message,createElement(Button,{label:"Retry",onPress:query.refetch})):null,
    MutationState:({mutation}:{mutation:{isPending?:boolean;error?:Error}})=>createElement("p",null,mutation.isPending?"Pending":mutation.error?.message),
    ActionMenu:({actions}:{actions:Array<{key:string;label:string;onPress:()=>void;disabled?:boolean}>})=>createElement("div",null,...actions.map(({key,...action})=>createElement(Button,{key,...action}))),
    Field:({label,value,editable,onChangeText}:{label:string;value:string;editable:boolean;onChangeText:(v:string)=>void})=>{state.changes.set(label,onChangeText);return createElement("textarea",{"aria-label":label,value,disabled:!editable,onChange:e=>onChangeText((e.currentTarget as HTMLTextAreaElement).value)});},
    FormActions:({submitLabel,onSubmit,disabled,busy,feedback,onCancel,cancelLabel}:{submitLabel:string;onSubmit:()=>void;disabled?:boolean;busy?:boolean;feedback?:unknown;onCancel?:()=>void;cancelLabel?:string})=>createElement("div",null,feedback as never,createElement(Button,{label:submitLabel,onPress:onSubmit,disabled,busy}),onCancel?createElement(Button,{label:cancelLabel!,onPress:onCancel}):null),
  };
});
const defaults={item:{provider:"github",kind:"pr",repo:"private/repository",number:7,identifier:"PR-7",title:"Private record title",url:"https://example.invalid/private/7",state:"open",draft:false,projectPath:"/private/project",labels:[{name:"Private label"}],assignees:[{login:"Private assignee"}]},
  origin:{machineId:"machine",projectId:"project"},onClose:vi.fn()};
let props={...defaults},root:ReturnType<typeof createRoot>|undefined,container:HTMLDivElement,cache:QueryClient;
function availability(){return {data:{available:state.allowed},isSuccess:true,isEnabled:true,fetchStatus:"idle",refetch:state.availabilityRetry};}
async function render(){await act(async()=>root!.render(createElement(QueryClientProvider,{client:cache},createElement(ProviderInboxDetail,{...props,availability:availability()} as never))));}
async function mount(){vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);state.job.mockResolvedValue({ok:true});container=document.createElement("div");document.body.append(container);cache=new QueryClient({defaultOptions:{mutations:{retry:false}}});root=createRoot(container);await render();}
async function click(label:string){await act(async()=>{[...container.querySelectorAll("button")].find(b=>b.textContent===label)!.click();await new Promise(r=>setTimeout(r,0));});}
async function type(value:string){await act(async()=>state.changes.get("Comment")!(value));}
async function confirm(){await act(async()=>{state.presses.get("Send")!();await new Promise(r=>setTimeout(r,0));});}
const field=()=>container.querySelector('textarea[aria-label="Comment"]') as HTMLTextAreaElement|null;
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;container?.remove();cache?.clear();props={...defaults};state.active="machine";state.project="project";state.allowed=true;state.error=null;state.reads=[];state.confirms=[];state.changes.clear();state.presses.clear();vi.clearAllMocks();vi.unstubAllGlobals();});
it("binds a confirmed merge to the displayed head",async()=>{
 await mount();await click("Merge");expect(state.confirms).toHaveLength(1);
 await act(async()=>{state.confirms[0]!();await new Promise(r=>setTimeout(r,0));});
 expect(state.job).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({action:"pr-action",input:expect.objectContaining({prAction:"merge",expectedHeadOid:"a".repeat(40),confirm:"CHANGE_PR_STATE"})}));
});
it("shows one authorized record identity and preserves exact reply target through confirmation",async()=>{
 await mount();expect(container.textContent?.match(/Private record title/g)).toHaveLength(1);expect(container.textContent).toContain("Private description");expect(container.textContent).toContain("Private conversation");
 await click("Reply");await type("Reviewed reply");await click("Send comment");expect(state.job).not.toHaveBeenCalled();await confirm();
 expect(state.job).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({machine:expect.objectContaining({id:"machine"})}),{action:"comment",input:{item:{provider:"github",kind:"pr",number:7,repo:"private/repository",projectPath:"/private/project",identifier:"PR-7"},projectId:"project",body:"Reviewed reply",inReplyTo:"thread-1",confirm:"SEND_COMMENT"}});
});
it("keeps a complete multilingual reply quotation in editor and frozen confirmation",async()=>{
 const original=comment.body;
 const quotation="İstanbul araştırması العربية 👩🏽‍💻\n".repeat(30)+"Final decision: retain the original project.";
 try {
  comment.body=quotation;await mount();await click("Reply");
  expect(container.querySelector("textarea")?.parentElement?.parentElement?.textContent).toContain(quotation);
  await type("Reviewed response");await click("Send comment");
  expect(container.querySelector('aside[aria-label="Send comment"]')?.textContent).toContain(quotation);
  expect(state.job).not.toHaveBeenCalled();
 } finally { comment.body=original; }
});
it.each(["read","machine","project","auth","identity"])("conceals all private detail/comment/draft content after %s loss and rejects retained actions after restoration",async(kind)=>{
 await mount();await click("Reply");await type("Private reply draft");await click("Send comment");const confirmOld=state.presses.get("Send")!,edit=state.changes.get("Comment")!,reply=state.presses.get("Reply")!,link=state.presses.get("Open in provider")!,refresh=state.presses.get("Refresh")!;
 if(kind==="read")state.allowed=false;if(kind==="machine")state.active="other";if(kind==="project")state.project="other";if(kind==="auth"||kind==="identity")state.error=Object.assign(Error("Private access unavailable"),{kind});
 await render();for(const value of ["Private record title","Private description","Private conversation","Private author","Private commenter","private-feature","Private label","Private assignee"])expect(container.textContent).not.toContain(value);expect(field()).toBeNull();
 expect(state.reads.at(-1)?.enabled).toBe(kind==="auth"||kind==="identity");await act(async()=>{edit("Must not replace draft");reply();link();confirmOld();refresh();});expect(state.open).not.toHaveBeenCalled();expect(state.job).not.toHaveBeenCalled();
 state.allowed=true;state.active="machine";state.project="project";state.error=null;await render();expect(field()?.value).toBe("Private reply draft");expect(container.textContent).toContain("Reply to Private commenter");await act(async()=>{confirmOld();link();reply();});expect(state.job).not.toHaveBeenCalled();expect(state.open).not.toHaveBeenCalled();
 await click("Send comment");await confirm();expect(state.job).toHaveBeenCalledOnce();
});
it("retains focused draft and selection on ordinary authorized query errors, and reports one shared cause",async()=>{
 await mount();await click("Reply");await type("Retained reply draft");const f=field()!;f.focus();f.setSelectionRange(2,8);state.error=Error("Shared network unavailable");await render();expect(field()).toBe(f);expect(document.activeElement).toBe(f);expect([f.selectionStart,f.selectionEnd]).toEqual([2,8]);expect(container.textContent).toContain("Private conversation");expect(container.textContent?.match(/Shared network unavailable/g)).toHaveLength(1);
 await click("Retry");expect(state.detailsRetry).toHaveBeenCalledOnce();expect(state.threadRetry).toHaveBeenCalledOnce();
});
it("retains an uncertain send and editable draft through concealment without authorizing another send",async()=>{
 await mount();await click("Reply");await type("Uncertain reply");state.job.mockRejectedValueOnce(new InboxJobError("Private receipt path /secret",true));await click("Send comment");await confirm();await act(async()=>new Promise(r=>setTimeout(r,0)));
 state.allowed=false;await render();expect(field()).toBeNull();expect(container.textContent).toContain("The send result is uncertain");expect(container.textContent).not.toContain("/secret");
 state.allowed=true;await render();expect(field()?.value).toBe("Uncertain reply");await type("New local text retained while checking receipt");expect(field()?.value).toBe("New local text retained while checking receipt");const sends=state.job.mock.calls.length;await click("Send comment");expect(container.querySelector('aside[aria-label="Send comment"]')).toBeNull();expect(state.job).toHaveBeenCalledTimes(sends);
});
it("retires a comment review after editor text changes or unmount",async()=>{
 await mount();await click("Add a comment");await type("Original");await click("Send comment");const old=state.presses.get("Send")!;await type("Changed");await act(async()=>old());expect(state.job).not.toHaveBeenCalled();
 await click("Send comment");const retained=state.presses.get("Send")!;await act(async()=>root!.unmount());root=undefined;await act(async()=>retained());expect(state.job).not.toHaveBeenCalled();
});

it("cancels a long review without losing draft, target, field identity or selection, and retires old review actions",async()=>{
 await mount();await click("Reply");const text="Long reviewed reply with original target\n".repeat(700);await type(text);const f=field()!;f.focus();f.setSelectionRange(4,12);
 await click("Send comment");const review=container.querySelector('aside[aria-label="Send comment"]')!;expect(review.textContent).toContain(text.trim());expect(review.textContent).toContain("private/repository");expect(review.textContent).toContain("PR-7");expect(review.textContent).toContain("Reply to Private commenter");expect(review.textContent).toContain("Target: thread-1");
 const old=state.presses.get("Send")!,cancel=state.presses.get("Cancel")!;await click("Cancel");expect(field()).toBe(f);expect(f.value).toBe(text);expect([f.selectionStart,f.selectionEnd]).toEqual([4,12]);await click("Send comment");await act(async()=>{old();cancel();});expect(container.querySelector('aside[aria-label="Send comment"]')).not.toBeNull();expect(state.job).not.toHaveBeenCalled();const send=state.presses.get("Send")!;await act(async()=>{send();send();await new Promise(r=>setTimeout(r,0));});expect(state.job).toHaveBeenCalledOnce();expect(state.job.mock.calls[0]![1].input.body).toBe(text.trim());
});
it("reviews a Linear reply by its real comment ID",async()=>{
 props={...props,item:{...props.item,provider:"linear",kind:"issue"}};await mount();await click("Reply");await type("Linear reply");await click("Send comment");expect(container.querySelector('aside[aria-label="Send comment"]')?.textContent).toContain("Target: comment-1");await confirm();expect(state.job.mock.calls[0]![1].input.inReplyTo).toBe("comment-1");
});
