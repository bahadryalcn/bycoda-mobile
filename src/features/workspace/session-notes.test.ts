// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SessionNotes } from "./session-notes";

const state = vi.hoisted(() => ({ active: "machine-a", contextSupported: true, transfer: vi.fn(), body: "Private full content", allowed: true, scrolling: false, epoch: {isCurrent: () => true}, detailError: null as unknown, listError: null as unknown, fetching: false, enabled: true, paused: false, callbacks: new Map<string, () => void>(), readers: [] as Array<{ method: string; enabled: boolean; read: (client: unknown) => Promise<unknown> }> }));
function machine() { return { id: state.active, name: "Computer", capabilities: ["notes.sessionFilter.v1", ...(state.contextSupported ? ["sessions.noteContext.v1"] : [])] }; }
vi.mock("@/i18n",()=>({useLocale:()=>"en"}));
vi.mock("react-native",()=>({View:({children}:PropsWithChildren)=>createElement("div",null,children)}));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => machine(), useMachines: {getState: () => ({activeId: state.active, machines: [machine()]})} }));
vi.mock("@/state/connection-scope", () => ({useConnectionScope: () => state.epoch}));
vi.mock("@/ui/private-access", () => ({usePrivateContentAccess: () => ({allowed: state.allowed, check: () => state.allowed}), PrivateContentAccessProvider: ({children}: PropsWithChildren) => children}));
vi.mock("@/ui/use-list-scroll-memory", () => ({useFilteredListScrollMemory: () => ({listProps: {}})}));
vi.mock("@/ui/search-field", () => ({CollectionToolbar: ({field}: {field: React.ReactNode}) => createElement("div", null, field)}));
vi.mock("./composer-transfer", () => ({ useComposerTransfer: () => ({ transfer: state.transfer }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/state/queries", () => ({ useHostQuery: (_key: unknown, method: string, _params: unknown, options: { enabled: boolean; queryFn: (client: unknown) => Promise<unknown> }) => {
  state.readers.push({ method, enabled: options.enabled, read: options.queryFn });
  const note = { id: "note-a", slug: "private-note", title: "Private note", body: state.body };
  return { refetch: vi.fn(), isEnabled: state.enabled, fetchStatus: state.paused ? "paused" : "idle", isFetching: state.fetching, error: method === "notes.list" ? state.listError : state.detailError, isSuccess: true, isError: false, data: method === "notes.list" ? { notes: [note], total: 1 } : note };
} }));
vi.mock("@/ui/primitives", () => {
  const wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: wrap, Stack: wrap, SearchField: ({label,value,onChangeText,editable}:any)=>{state.callbacks.set(label,onChangeText);return createElement("input",{value,disabled:!editable,onInput:(event:any)=>onChangeText(event.currentTarget.value)});}, FormActions: ({submitLabel,onSubmit,cancelLabel,onCancel,feedback}: any) => {state.callbacks.set(submitLabel,onSubmit);return createElement("div",null,createElement("button",{onClick:onSubmit},submitLabel),cancelLabel?createElement("button",{onClick:onCancel},cancelLabel):null,feedback);}, Sheet: ({ children, footer, scroll }: PropsWithChildren<{ footer?: React.ReactNode; scroll: boolean }>) => { state.scrolling=scroll;return createElement("div", null, children, footer); }, QueryState: ({empty,emptyTitle,emptyAction}:any)=>empty?createElement("div",null,emptyTitle,emptyAction?createElement("button",{onClick:emptyAction.onPress},emptyAction.label):null):null,
    Notice: ({ message }: { message: string }) => createElement("div", null, message),
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => createElement("button", { onClick: onPress }, label),
    ScreenList: ({ data, header, renderItem }: { data: unknown[]; header: React.ReactNode; renderItem: (row: { item: unknown }) => React.ReactNode }) => createElement("div", null, header, ...data.map((item) => renderItem({ item }))),
  };
});
vi.mock("../management/notes/note-summary-row", () => ({ NoteSummaryRow: ({ note, onPress }: { note: { id: string; title: string }; onPress: () => void }) => createElement("button", { key: note.id, onClick: onPress }, note.title) }));
vi.mock("@/ui/message-text", () => ({ MessageText: ({ text }: { text: string }) => createElement("div", null, text) }));
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
const props = { scope: { machineId: "machine-a", sessionId: "session-a" }, projectId: "project-a", onClose: vi.fn() };
afterEach(async () => { await act(async () => root?.unmount()); state.active = "machine-a"; state.readers = []; state.contextSupported = true; state.body = "Private full content"; state.allowed=true;state.epoch={isCurrent:()=>true};state.detailError=null;state.listError=null;state.fetching=false;state.enabled=true;state.paused=false;state.callbacks.clear();vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root = createRoot(container);
  await act(async () => root.render(createElement(SessionNotes, props)));
}
it("pins list and selected note reads to the original session and project", async () => {
  await mount();
  const request = vi.fn(async () => ({ notes: [], total: 0 }));
  await state.readers.find((read) => read.method === "notes.list")!.read({ request });
  expect(request).toHaveBeenCalledWith("notes.list", { projectId: "project-a", sessionId: "session-a" }, { signal: undefined });
  await act(async () => container.querySelector("button")!.click());
  expect(container.textContent).toContain("Private full content");
  const selected = state.readers.filter((read) => read.method === "notes.get" && read.enabled).at(-1)!;
  request.mockResolvedValueOnce(null as never); await selected.read({ request });
  expect(request).toHaveBeenLastCalledWith("notes.get", { id: "note-a", projectId: "project-a", sessionId: "session-a" }, { signal: undefined });
});
it("hides cached selected content and disables reads when the computer changes", async () => {
  await mount(); await act(async () => container.querySelector("button")!.click());
  state.active = "machine-b"; state.readers = [];
  await act(async () => root.render(createElement(SessionNotes, props)));
  expect(container.textContent).not.toContain("Private full content");
  expect(container.textContent).toContain("Record access is unavailable");
  expect(state.readers.every((read) => !read.enabled)).toBe(true);
});
it("transfers only an explicitly selected full snapshot, once, without sending", async () => {
  await mount(); expect(state.transfer).not.toHaveBeenCalled();
  await act(async () => container.querySelector("button")!.click());
  expect(state.transfer).not.toHaveBeenCalled();
  const attach = [...container.querySelectorAll("button")].find((button) => button.textContent === "Add as context")!;
  await act(async () => { attach.click(); attach.click(); });
  expect(state.transfer).toHaveBeenCalledExactlyOnceWith({ machineId: "machine-a", sessionId: "session-a", text: "",
    noteCard: { id: "note-a", slug: "private-note", title: "Private note", body: "Private full content" } });
  expect(props.onClose).toHaveBeenCalledOnce();
});
it("does not expose attachment on an old host and never truncates an oversized note", async () => {
  state.contextSupported = false;
  await mount(); await act(async () => container.querySelector("button")!.click());
  expect(container.textContent).not.toContain("Add as context");
  state.contextSupported = true; state.body = "x".repeat(64_001);
  await act(async () => root.render(createElement(SessionNotes, props)));
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Add as context")!.click());
  expect(state.transfer).not.toHaveBeenCalled(); expect(props.onClose).not.toHaveBeenCalled();
  expect(container.textContent).toContain("64,000");
});

async function render() { await act(async()=>root.render(createElement(SessionNotes,props))); }
async function select() { await act(async()=>[...container.querySelectorAll("button")].find(b=>b.textContent==="Private note")!.click()); }
for(const kind of ["private","epoch","machine","auth","identity","paused","disabled","fetching","capability"]){
 it(`retires captured transfer after ${kind} change and restoration`,async()=>{
  await mount();await select();const stale=state.callbacks.get("Add as context")!;
  if(kind==="private")state.allowed=false;
  if(kind==="epoch")state.epoch={isCurrent:()=>true};
  if(kind==="machine")state.active="machine-b";
  if(kind==="auth"||kind==="identity")state.detailError={kind};
  if(kind==="paused")state.paused=true;
  if(kind==="disabled")state.enabled=false;
  if(kind==="fetching")state.fetching=true;
  if(kind==="capability")state.contextSupported=false;
  await render();await act(async()=>stale());expect(state.transfer).not.toHaveBeenCalled();
  if(kind!=="fetching"&&kind!=="capability")expect(container.textContent).not.toContain("Private full content");
  state.allowed=true;state.active="machine-a";state.detailError=null;state.paused=false;state.enabled=true;state.fetching=false;state.contextSupported=true;
  await render();await act(async()=>stale());expect(state.transfer).not.toHaveBeenCalled();
 });
}
it("rejects a transfer after a synchronous capability loss before React commits",async()=>{
 await mount();await select();const stale=state.callbacks.get("Add as context")!;state.contextSupported=false;await act(async()=>stale());expect(state.transfer).not.toHaveBeenCalled();
});
it("does not close or attach from a callback retained after unmount",async()=>{
 await mount();await select();const stale=state.callbacks.get("Add as context")!;await act(async()=>root.unmount());await act(async()=>stale());expect(state.transfer).not.toHaveBeenCalled();expect(props.onClose).not.toHaveBeenCalled();
});
it("rejects late selected-note responses after returning to the list",async()=>{
 await mount();await select();const read=state.readers.filter(r=>r.method==="notes.get"&&r.enabled).at(-1)!;
 let finish!:(value:unknown)=>void;const pending=read.read({request:()=>new Promise(resolve=>{finish=resolve;})});
 await act(async()=>[...container.querySelectorAll("button")].find(b=>b.textContent==="Back")!.click());
 finish(null);await expect(pending).rejects.toThrow("selected note changed");expect(state.transfer).not.toHaveBeenCalled();
});
it("rejects delayed list reads when the original connection loses private access",async()=>{
 await mount();const read=state.readers.find(r=>r.method==="notes.list")!;
 let finish!:(value:unknown)=>void;const pending=read.read({request:()=>new Promise(resolve=>{finish=resolve;})});
 state.allowed=false;finish({notes:[],total:0});await expect(pending).rejects.toThrow("connection is unavailable");
});
it("keeps the full readable note after a failed composer transfer and permits explicit retry",async()=>{
 state.transfer.mockImplementationOnce(()=>{throw Error("Composer unavailable");});await mount();await select();
 await act(async()=>state.callbacks.get("Add as context")!());expect(container.textContent).toContain("Private full content");expect(props.onClose).not.toHaveBeenCalled();
 await act(async()=>state.callbacks.get("Add as context")!());expect(state.transfer).toHaveBeenCalledTimes(2);expect(props.onClose).toHaveBeenCalledOnce();
});

it("conceals an authorization-failed detail through a network failure and retry until fresh success",async()=>{
 await mount();await select();state.detailError={kind:"auth"};await render();expect(container.textContent).not.toContain("Private full content");
 state.detailError={kind:"network"};await render();expect(container.textContent).not.toContain("Private full content");
 state.detailError=null;state.fetching=true;await render();expect(container.textContent).not.toContain("Private full content");
 state.fetching=false;await render();expect(container.textContent).toContain("Private full content");
});

it("retains one list scroll owner while reads are paused or disabled",async()=>{
 await mount();expect(state.scrolling).toBe(false);state.paused=true;await render();expect(state.scrolling).toBe(false);
 state.paused=false;state.enabled=false;await render();expect(state.scrolling).toBe(false);
});

const search=(value:string)=>act(async()=>(state.callbacks.get("Search loaded records") as (value:string)=>void)(value));
it("filters loaded note titles/previews and restores the query after a reader return",async()=>{await mount();await search("full content");expect(container.textContent).toContain("Private note");await select();expect(container.querySelector("input")).toBeNull();await act(async()=>[...container.querySelectorAll("button")].find(b=>b.textContent==="Back")!.click());expect(container.querySelector("input")?.value).toBe("full content");expect(container.textContent).toContain("Private note");});
it("distinguishes no matching results and permits clearing without Host reads",async()=>{await mount();await search("not-loaded");expect(container.textContent).toContain("No matching results");expect(container.textContent).not.toContain("Private note");await act(async()=>[...container.querySelectorAll("button")].find(b=>b.textContent==="Clear search")!.click());expect(container.querySelector("input")?.value).toBe("");expect(container.textContent).toContain("Private note");});
it("accepts multiple native input changes in one batch and retains the same input",async()=>{await mount();const input=container.querySelector("input");const change=state.callbacks.get("Search loaded records") as (value:string)=>void;await act(async()=>{change("not-loaded");change("private");});expect(container.querySelector("input")).toBe(input);expect(input?.value).toBe("private");expect(container.textContent).toContain("Private note");});
it("ignores captured input changes while a note reader is selected",async()=>{await mount();await search("private");const old=state.callbacks.get("Search loaded records") as (value:string)=>void;await select();await act(async()=>old("changed while hidden"));await act(async()=>[...container.querySelectorAll("button")].find(b=>b.textContent==="Back")!.click());expect(container.querySelector("input")?.value).toBe("private");});
it("masks a search during unavailable reads and restores it after fresh success",async()=>{await mount();await search("private");state.paused=true;await render();expect(container.querySelector("input")?.value).toBe("");expect(container.querySelector("input")?.disabled).toBe(true);state.paused=false;await render();expect(container.querySelector("input")?.value).toBe("private");});
