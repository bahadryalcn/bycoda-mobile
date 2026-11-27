// @vitest-environment happy-dom
import { act,createElement,type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach,expect,it,vi } from "vitest";
import { useSheetDismissal } from "@/ui/sheet-guard";
import { SessionQueueEditor } from "./session-queue-editor-view";
const f=vi.hoisted(()=>({allowed:true,epoch:true,activeId:"m",commands:new Map<string,()=>void>(),change:undefined as undefined|((text:string)=>void),confirm:undefined as undefined|(()=>void),cancel:undefined as undefined|(()=>void)}));
vi.mock("react-native",()=>({useWindowDimensions:()=>({height:640})}));
vi.mock("lucide-react-native/icons/pencil",()=>({default:()=>null}));
vi.mock("@/ui/theme",()=>({useMobileTheme:() => ({ mode: "dark", colors: {muted:"#555"}, semanticColors: {}, uiStyles: {} })}));
vi.mock("@/ui/tokens",()=>({colors:{muted:"#555"}}));
vi.mock("@/state/machines",()=>({useMachines:Object.assign((select:any)=>select({machines:[{id:"m",name:"Original computer"}]}),{getState:()=>({activeId:f.activeId})})}));
vi.mock("@/state/connection-scope",()=>{const value={isCurrent:()=>f.epoch};return{useConnectionScope:()=>value};});
vi.mock("@/ui/private-access",()=>({usePrivateContentAccess:()=>({allowed:f.allowed,check:()=>f.allowed}),PrivateContentAccessProvider:({children}:PropsWithChildren)=>children}));
vi.mock("@/ui/copy",()=>({useCopy:()=> (_tr:string,en:string)=>en}));
vi.mock("@/i18n",()=>({useLocale:()=>"en"}));
vi.mock("@/ui/scope-line",()=>({ScopeLine:({scope}:any)=>createElement("span",null,scope.computer)}));
vi.mock("@/ui/confirm",()=>({confirmAction:vi.fn()}));
vi.mock("@/ui/search-field",()=>({CollectionToolbar:({field,actions}:any)=>createElement("header",null,field,actions)}));
vi.mock("@/ui/chat-controls",()=>({ChatToolbarAction:({label,onPress}:any)=>createElement("button",{onClick:onPress},label)}));
vi.mock("@/ui/action-review-sheet",()=>({ActionReviewSheet:({children,onClose,onConfirm}:any)=>{f.confirm=onConfirm;f.cancel=onClose;return createElement("aside",null,children);}}));
vi.mock("@/ui/primitives",()=>{
 const content=({children}:any)=>createElement("div",null,children);
 const button=({label,onPress,disabled}:any)=>{f.commands.set(label,onPress);return createElement("button",{disabled,onClick:onPress},label);};
 return{Button:button,Body:content,Stack:content,Disclosure:content,Empty:({title}:any)=>createElement("p",null,title),Loading:()=>createElement("p",null,"Loading"),Notice:({message}:any)=>createElement("p",null,message), StateView: ({ title }:any) => createElement("p",null,title),ErrorText:({error,message}:any)=>error?createElement("p",null,message||error.message):null,
 Sheet: function SheetFixture({visible,children,onClose,dirty=false,dismissible=true,dismissalRetryKey}:any) {
   const dismissal=useSheetDismissal({visible,onClose,dirty,pending:!dismissible,dismissalRetryKey});
   return visible?createElement("article",null,createElement("header",null,button({label:"Close",onPress:dismissal.requestClose,disabled:!dismissible})),children,
     dismissal.confirming?button({label:"Discard changes",onPress:dismissal.confirmClose}):null):null;
 },
 Input:({value,onChangeText,editable}:any)=>{f.change=onChangeText;return createElement("textarea",{value,readOnly:!editable,onInput:(event:any)=>onChangeText(event.currentTarget.value)});},ActionMenu:({actions}:any)=>createElement("nav",null,...actions.map((action:any)=>createElement("section",{key:action.key},button(action)))),
 FormActions:({submitLabel,onSubmit,disabled,onCancel,cancelLabel,feedback,dirty}:any)=>createElement("footer",null,feedback,dirty?createElement("span",null,"Unsaved changes"):null,button({label:submitLabel,onPress:onSubmit,disabled}),onCancel?button({label:cancelLabel,onPress:onCancel}):null)};
});
vi.mock("@/ui/screen-list",()=>({ScreenList:({data,header,renderItem}:any)=>createElement("main",null,header,...data.map((item:any,index:number)=>createElement("section",{key:index},renderItem({item,index}))))}));
const original={id:"message-1",text:"Original queued message",attachments:[{id:"file",name:"Complete attachment.txt",size:1024,mimeType:"text/plain",kind:"file"}],modelTarget:{harness:"claude",model:"model",modelSettings:{effort:"high"}}};
function initial(){const value={version:1,original,text:"Unsaved changed text",owner:"client"};return{value,valueRef:{current:value},visible:true,working:false,ready:true,error:null,editError:null,isStored:false,hide:vi.fn(),open:vi.fn(),load:vi.fn(async()=>undefined),save:vi.fn(),reload:vi.fn(),discard:vi.fn(),setValue:vi.fn((update:any)=>{editor.value=typeof update==="function"?update(editor.valueRef.current):update;editor.valueRef.current=editor.value;})};}
let editor:any=initial(),root:ReturnType<typeof createRoot>;
const container=document.createElement("div");
async function render(overrides:Partial<React.ComponentProps<typeof SessionQueueEditor>>={}){await act(async()=>root.render(createElement(SessionQueueEditor,{scope:{machineId:"m",sessionId:"session"},editor,blocked:false,...overrides})));}
async function mount(){vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);document.body.append(container);root=createRoot(container);await render();}
async function press(label:string){await act(async()=>f.commands.get(label)!());}
async function review(kind:"reload"|"discard"="reload"){await press(kind==="reload"?"Reload latest queued message":"Discard edit");return f.confirm!;}
afterEach(async()=>{await act(async()=>root?.unmount());container.remove();editor=initial();f.allowed=true;f.epoch=true;f.activeId="m";f.commands.clear();f.change=undefined;f.confirm=undefined;f.cancel=undefined;vi.unstubAllGlobals();});

it.each(["editable", "load error", "empty", "unavailable"])("uses a single shared header close in the %s editor", async (state) => {
  if (state === "load error" || state === "empty") editor.value = editor.valueRef.current = null;
  if (state === "load error") { editor.ready = false; editor.error = new Error("Storage read failed"); }
  if (state === "unavailable") f.allowed = false;
  await mount();
  const sheet = container.querySelector("article")!;
  const closes = [...sheet.querySelectorAll("button")].filter(button => button.textContent === "Close");
  expect(closes).toHaveLength(1);
  expect(closes[0].closest("header")).not.toBeNull();
  if (state === "editable") {
    expect(sheet.textContent).toContain("Unsaved changes");
    await press("Save changes");
    expect(editor.save).toHaveBeenCalledOnce();
  }
});

it("guards header close during a pending save and hands the same draft to the close owner afterward", async () => {
  await mount();
  const draft = editor.value;
  const close = f.commands.get("Close")!;
  editor.working = true;
  await render();
  await act(async () => close());
  expect(editor.hide).not.toHaveBeenCalled();
  expect(container.querySelector<HTMLButtonElement>("article > header button")?.disabled).toBe(true);
  editor.working = false;
  await render();
  await press("Close");
  expect(editor.hide).toHaveBeenCalledOnce();
  expect(container.textContent).not.toContain("Discard changes");
  expect(editor.value).toBe(draft);
  expect(editor.discard).not.toHaveBeenCalled();
});

it("keeps a failed close on screen with original draft text and permits another close attempt", async () => {
  await mount();
  const input = container.querySelector("textarea")!;
  input.focus();
  input.setSelectionRange(3, 8);
  const draft = editor.value;
  await press("Close");
  expect(editor.hide).toHaveBeenCalledOnce();
  editor.working = true;
  await render();
  editor.working = false;
  editor.editError = new Error("Draft storage unavailable");
  await render();
  expect(container.textContent).toContain("Draft storage unavailable");
  expect(container.querySelector("textarea")).toBe(input);
  expect(document.activeElement).toBe(input);
  expect([input.selectionStart, input.selectionEnd]).toEqual([3, 8]);
  expect(input.value).toBe(draft.text);
  expect(editor.value).toBe(draft);
  await press("Close");
  expect(editor.hide).toHaveBeenCalledTimes(2);
  await render();
  await press("Close");
  expect(editor.hide).toHaveBeenCalledTimes(2);
  expect(editor.discard).not.toHaveBeenCalled();
});

it("reviews full draft identity without changing the input or selection on cancellation",async()=>{await mount();const input=container.querySelector("textarea")!;input.setSelectionRange(3,7);const confirm=await review();const aside=container.querySelector("aside")!;for(const text of ["Original computer","message-1","Unsaved changed text","Complete attachment.txt"])expect(aside.textContent).toContain(text);await act(async()=>f.cancel!());expect(container.querySelector("textarea")).toBe(input);expect(input.selectionStart).toBe(3);expect(input.value).toBe("Unsaved changed text");await act(async()=>confirm());expect(editor.reload).not.toHaveBeenCalled();expect(editor.hide).not.toHaveBeenCalled();});
it.each(["reload","discard"] as const)("consumes one exact %s confirmation",async(kind)=>{await mount();const confirm=await review(kind);await act(async()=>{confirm();confirm();});expect(editor[kind]).toHaveBeenCalledOnce();expect(editor[kind==="reload"?"discard":"reload"]).not.toHaveBeenCalled();});
it("accepts batched native changes and rejects the superseded approval before commit",async()=>{await mount();const confirm=await review();const change=f.change!;await act(async()=>{change("First change");change("Latest change");confirm();});await render();expect(editor.valueRef.current.text).toBe("Latest change");expect(editor.setValue).toHaveBeenCalledTimes(2);expect(editor.reload).not.toHaveBeenCalled();expect(container.querySelector("aside")).toBeNull();});
it.each(["access","epoch","active","machine","session","hidden","working","blocked","unready","replacement"])("retires approval after %s loss and return",async(kind)=>{await mount();const confirm=await review();if(kind==="access")f.allowed=false;if(kind==="epoch")f.epoch=false;if(kind==="active")f.activeId="other";if(kind==="hidden")editor.visible=false;if(kind==="working")editor.working=true;if(kind==="unready")editor.ready=false;if(kind==="replacement"){editor.value={...editor.value,original:{...original,id:"other"}};editor.valueRef.current=editor.value;}
 await render(kind==="machine"?{scope:{machineId:"other",sessionId:"session"}}:kind==="session"?{scope:{machineId:"m",sessionId:"other"}}:kind==="blocked"?{blocked:true}:{});f.allowed=true;f.epoch=true;f.activeId="m";editor.visible=true;editor.working=false;editor.ready=true;await render();await act(async()=>confirm());expect(editor.reload).not.toHaveBeenCalled();expect(container.querySelector("aside")).toBeNull();});
it("rejects an old input callback after hiding and reopening the same draft",async()=>{await mount();const change=f.change!;editor.visible=false;await render();editor.visible=true;await render();await act(async()=>change("Stale text"));expect(editor.value.text).toBe("Unsaved changed text");expect(editor.setValue).not.toHaveBeenCalled();});
it("retries a failed local load once without authorizing save or discard",async()=>{editor.value=null;editor.valueRef.current=null;editor.ready=false;editor.error=new Error("Storage read failed");await mount();let resolve!:()=>void;editor.load.mockImplementationOnce(()=>new Promise<undefined>(done=>{resolve=()=>done(undefined);}));const retry=f.commands.get("Retry loading draft")!;await act(async()=>{retry();retry();});expect(editor.load).toHaveBeenCalledOnce();expect(editor.save).not.toHaveBeenCalled();expect(editor.discard).not.toHaveBeenCalled();await act(async()=>resolve());});
it("requires explicit editing resumption after recovering an unread draft",async()=>{const recovered=editor.value;editor.value=null;editor.valueRef.current=null;editor.ready=false;editor.error=new Error("Storage read failed");await mount();await press("Retry loading draft");editor.value=recovered;editor.valueRef.current=recovered;editor.ready=true;editor.error=null;await render();expect(editor.open).not.toHaveBeenCalled();expect(editor.save).not.toHaveBeenCalled();await press("Continue editing");expect(editor.open).toHaveBeenCalledOnce();expect(editor.save).not.toHaveBeenCalled();});
it("preserves a save-error draft and offers Save rather than reloading over it",async()=>{editor.error=new Error("Storage write failed");await mount();expect(container.querySelector("textarea")!.readOnly).toBe(false);await press("Save changes");expect(editor.save).toHaveBeenCalledOnce();expect(editor.load).not.toHaveBeenCalled();});
it("shows an explicit empty state after a successful null draft read",async()=>{editor.value=null;editor.valueRef.current=null;await mount();expect(container.textContent).toContain("No queued message draft.");await press("Close");expect(editor.hide).toHaveBeenCalledOnce();expect(editor.save).not.toHaveBeenCalled();});
it("keeps private draft text concealed while allowing local close/persist",async()=>{await mount();f.allowed=false;await render();expect(container.textContent).not.toContain("Unsaved changed text");await press("Close");expect(editor.hide).toHaveBeenCalledOnce();expect(editor.discard).not.toHaveBeenCalled();});
it("does not save behind a pending review or while writes are blocked",async()=>{await mount();const save=f.commands.get("Save changes")!;await review();await act(async()=>save());expect(editor.save).not.toHaveBeenCalled();await act(async()=>f.cancel!());await render({blocked:true});await press("Save changes");expect(editor.save).not.toHaveBeenCalled();});
it("ignores retained review and input callbacks after unmount",async()=>{await mount();const change=f.change!,confirm=await review();await act(async()=>root.unmount());await act(async()=>{change("Retired");confirm();});expect(editor.setValue).not.toHaveBeenCalled();expect(editor.reload).not.toHaveBeenCalled();});

it("offers explicit cancellation of a parked queue edit without overwriting composer draft", async () => {
  editor.visible = false;
  await mount();
  const cancel = [...container.querySelectorAll("button")].find(button => button.textContent === "Cancel editing");
  expect(cancel).toBeDefined();
  await act(async () => cancel!.click());
  expect(container.querySelector("aside")).not.toBeNull();
  expect(editor.discard).not.toHaveBeenCalled();
  await act(async () => f.confirm!());
  expect(editor.discard).toHaveBeenCalledOnce();
  expect(editor.save).not.toHaveBeenCalled();
  expect(editor.setValue).not.toHaveBeenCalled();
});
it("retires inline cancel approval when edit identity changes", async () => {
  editor.visible = false;
  await mount();
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Cancel editing")!.click());
  const confirm = f.confirm!;
  editor.value = { ...editor.value, original: { ...original, id: "replacement" } };
  editor.valueRef.current = editor.value;
  await render();
  await act(async () => confirm());
  expect(editor.discard).not.toHaveBeenCalled();
});
it.each(["access", "epoch", "active", "working", "blocked", "unready"])("retires parked-edit cancellation after %s loss and return", async (kind) => {
  editor.visible = false;
  await mount();
  await press("Cancel editing");
  const confirm = f.confirm!;
  if (kind === "access") f.allowed = false;
  if (kind === "epoch") f.epoch = false;
  if (kind === "active") f.activeId = "other";
  if (kind === "working") editor.working = true;
  if (kind === "unready") editor.ready = false;
  await render(kind === "blocked" ? { blocked: true } : {});
  f.allowed = true; f.epoch = true; f.activeId = "m";
  editor.working = false; editor.ready = true;
  await render();
  await act(async () => confirm());
  expect(editor.discard).not.toHaveBeenCalled();
});
it("keeps failed parked-edit cancellation visible and draft recoverable", async () => {
  editor.visible = false;
  editor.editError = new Error("Queue changed elsewhere");
  await mount();
  expect(container.textContent).toContain("Queue changed elsewhere");
  expect(container.textContent).toContain("Editing queued message");
  expect(editor.setValue).not.toHaveBeenCalled();
});

it("shows readable provider identity and keeps internal model settings out of the editor", async () => {
  editor.value = { ...editor.value, original: { ...original, modelTarget: {
    harness: "codex", model: "codex:gpt-6.1-terra", modelSettings: { reasoningEffort: "low", serviceTier: "default" },
  } } };
  editor.valueRef.current = editor.value;
  await mount();
  expect(container.textContent).toContain("Codex");
  expect(container.textContent).not.toContain("codex:gpt-6.1-terra");
  expect(container.textContent).not.toContain("reasoningEffort");
  expect(container.textContent).not.toContain("serviceTier");
  expect(container.querySelector("textarea")!.value).toBe("Unsaved changed text");
  expect(editor.setValue).not.toHaveBeenCalled();
});
