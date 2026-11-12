// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ConflictReview } from "./conflict-review";
import { conflictParts } from "./conflict-review-model";
const state = vi.hoisted(() => ({ allowed:true,epoch:true,enabled:true,paused:false,queryError:null as Error|null,dismiss:undefined as undefined|(()=>void),callbacks:new Map<string,(value:any)=>void>(),closed:vi.fn(),changed:vi.fn(),activeId: "machine", data: {} as Record<string, unknown>, write: vi.fn(), confirmation: undefined as undefined | (() => void), detail: "", busy: vi.fn(), refetch: vi.fn() }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/ui/tokens", () => ({ space: { sm: 8 } }));
vi.mock("@/state/connection-scope",()=>{const scope={isCurrent:()=>state.epoch};return{useConnectionScope:()=>scope};});
vi.mock("@/ui/private-access",()=>({usePrivateContentAccess:()=>({allowed:state.allowed,check:()=>state.allowed}),PrivateContentAccessProvider:({children}:PropsWithChildren)=>children}));
vi.mock("@/ui/action-review-sheet",()=>({ActionReviewSheet:({children,onConfirm,onClose}:PropsWithChildren<{onConfirm:()=>void;onClose:()=>void}>)=>{state.confirmation=onConfirm;state.dismiss=onClose;return createElement("aside",null,children);}}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./git-diff-viewer", () => ({ GitDiffViewer: ({ lines }: { lines: { text: string }[] }) => createElement("pre", null, lines.map((line) => line.text).join("\n")) }));
vi.mock("@/ui/confirm", () => ({ confirmAction: (_title: string, detail: string, _label: string, callback: () => void) => { state.confirmation = callback; state.detail = detail; } }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "machine", capabilities: ["git.selective.review"] }), useMachines: { getState: () => ({ activeId: state.activeId }) } }));
vi.mock("@/state/queries", () => ({ useHostMutation: () => ({ mutateAsync: state.write }), useHostQuery: () => ({ isSuccess: true, isFetching: false, isEnabled:state.enabled,fetchStatus:state.paused?"paused":"idle",error:state.queryError,data: state.data, refetch: state.refetch }) }));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label);
  return { Stack:wrapper, Body: wrapper, Button: button, ActionMenu:({actions}:any)=>createElement("nav",null,...actions.map((a:any)=>button({label:a.label,disabled:a.disabled,onPress:a.onPress}))), Row: wrapper, ErrorText: () => null, QueryState: () => null,
    Notice: ({ message }: { message: string }) => createElement("div", null, message), StateView: ({ title }: { title: string }) => createElement("div", null, title),
    Sheet: ({ children, footer }: PropsWithChildren<{ footer: React.ReactNode }>) => createElement("div", null, children, footer),
    SelectField: ({ label, value, disabled, onChange, options }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void; options: { value: string; label: string }[] }) => { state.callbacks.set(label,onChange); return createElement("select", { "aria-label": label, value, disabled, onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.target.value) }, options.map((option) => createElement("option", { key: option.value, value: option.value }, option.label))); },
    ScreenList: ({ header, data, renderItem }: { header: React.ReactNode; data: unknown[]; renderItem: (args: { item: unknown }) => React.ReactNode }) => createElement("div", null, header, ...data.map((item, key) => createElement("div", { key }, renderItem({ item })))),
  };
});
const container = document.createElement("div"); let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root?.unmount()); state.allowed=true;state.epoch=true;state.enabled=true;state.paused=false;state.queryError=null;state.dismiss=undefined;state.activeId = "machine"; state.confirmation = undefined; vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function mount(missing = false) {
  const working = "context\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> incoming\nafter";
  state.data = { snapshot: "a".repeat(64), operation: "rebase", stages: { relative: "a.txt", path: "a.txt", kind: "both-modified", base: "base\n", ours: "ours\n", theirs: missing ? null : "theirs\n", binary: false, tooLarge: false, workingExists: !missing }, working: missing ? null : working, parts: missing ? null : conflictParts(working), workingError: null };
  state.refetch.mockImplementation(async () => ({ data: state.data, error: null }));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root = createRoot(container);
  await act(async () => root.render(createElement(ConflictReview, { scope: { projectId: "p", root: "/repo" }, path: "a.txt", onBusyChange: state.busy, onClose: state.closed, onChanged: state.changed })));
  return working;
}
const click = (label: string) => act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click());
it("submits explicit block choices against frozen working bytes and latches an uncertain result", async () => {
  state.write.mockRejectedValueOnce(Object.assign(new Error("Disconnected"), { uncertain: true })); const working = await mount();
  expect(container.textContent).toContain("During a rebase");
  await act(async () => { const select = container.querySelector('select[aria-label="Conflict block {p0}"]') as HTMLSelectElement; select.value = "both"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await click("Apply reviewed resolution"); expect(state.write).not.toHaveBeenCalled(); const confirmation = state.confirmation!;
  await act(async () => confirmation()); await act(async () => confirmation());
  expect(state.write).toHaveBeenCalledExactlyOnceWith({ command: "git_resolve_conflict", args: { cwd: "/repo", relative: "a.txt", side: "reviewed", contents: "context\nours\ntheirs\nafter", expectedCurrent: working, expectedSnapshot: "a".repeat(64) } });
  expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Apply reviewed resolution")!.disabled).toBe(true);
  expect(container.querySelectorAll("textarea,input")).toHaveLength(0);
});
it("explicitly confirms deletion and cannot retarget it to another computer", async () => {
  await mount(true); await click("Use incoming version"); expect(container.querySelector("aside")!.textContent).toContain("deletes the file");
  state.activeId = "other"; await act(async () => state.confirmation!()); expect(state.write).not.toHaveBeenCalled();
});

async function rerender(path = "a.txt") { await act(async () => root.render(createElement(ConflictReview, { scope: { projectId: "p", root: "/repo" }, path, onBusyChange: state.busy, onClose: state.closed, onChanged: state.changed }))); }
async function choose(value: string) { await act(async () => { const field = container.querySelector('select[aria-label="Conflict block {p0}"]') as HTMLSelectElement; field.value = value; field.dispatchEvent(new Event("change", { bubbles: true })); }); }
it("cancel preserves choices and the reviewed full output without sending", async () => {
  await mount(); await choose("both"); await click("Apply reviewed resolution"); const old = state.confirmation!;
  expect(container.querySelector("aside")!.textContent).toContain("context\nours\ntheirs\nafter"); await act(async () => state.dismiss!());
  expect((container.querySelector('select[aria-label="Conflict block {p0}"]') as HTMLSelectElement).value).toBe("both");
  await act(async () => old()); expect(state.write).not.toHaveBeenCalled();
});
it("retires an approval after a newer block choice", async () => {
  await mount(); await choose("ours"); await click("Apply reviewed resolution"); const old = state.confirmation!;
  await choose("theirs"); expect(container.querySelector("aside")).toBeNull(); await act(async () => old()); expect(state.write).not.toHaveBeenCalled();
});
it.each(["access", "auth", "identity", "disabled", "paused", "epoch", "path", "snapshot"])("rejects retained approval after %s loss and return", async kind => {
  await mount(); await click("Use our version"); const old = state.confirmation!;
  if (kind === "access") state.allowed = false;
  if (kind === "auth" || kind === "identity") state.queryError = Object.assign(new Error("Private failure"), { kind });
  if (kind === "disabled") state.enabled = false;
  if (kind === "paused") state.paused = true;
  if (kind === "epoch") state.epoch = false;
  if (kind === "snapshot") state.data = { ...state.data, snapshot: "b".repeat(64) };
  await rerender(kind === "path" ? "other.txt" : "a.txt"); expect(container.querySelector("aside")).toBeNull();
  state.allowed = true; state.queryError = null; state.enabled = true; state.paused = false; state.epoch = true; await rerender();
  await act(async () => old()); expect(state.write).not.toHaveBeenCalled();
});
it("a refresh result cannot erase choices made while the read was pending", async () => {
  await mount(); let resolve!: (v: { data: typeof state.data }) => void;
  state.refetch.mockImplementationOnce(() => new Promise(r => { resolve = r; })); await click("Review current conflict"); await choose("both");
  await act(async () => resolve({ data: { ...state.data, snapshot: "b".repeat(64) } }));
  expect((container.querySelector('select[aria-label="Conflict block {p0}"]') as HTMLSelectElement).value).toBe("both");
});
it("retained approval cannot write after unmount", async () => {
  await mount(); await click("Use our version"); const old = state.confirmation!; await act(async () => root.unmount()); await act(async () => old());
  expect(state.write).not.toHaveBeenCalled(); root = createRoot(container);
});
it("an old refresh-discard confirmation cannot discard newer choices", async () => {
  await mount(); await choose("ours"); await click("Review current conflict"); const old = state.confirmation!; await choose("both");
  await act(async () => old()); expect(state.refetch).not.toHaveBeenCalled();
});
it("block choices preserve the active source viewer instance", async () => {
  await mount(); const viewer = container.querySelector("pre"); await choose("both"); expect(container.querySelector("pre")).toBe(viewer);
});
it("a completed write cannot close or refresh another owner after unmount", async () => {
  let resolve!: () => void; state.write.mockImplementationOnce(() => new Promise<void>(r => { resolve = r; }));
  await mount(); await click("Use our version"); await act(async () => state.confirmation!()); await act(async () => root.unmount()); await act(async () => resolve());
  expect(state.closed).not.toHaveBeenCalled(); expect(state.changed).not.toHaveBeenCalled(); root = createRoot(container);
});
it("a queued block callback cannot change submitted choices while delivery is pending", async () => {
  let resolve!: () => void; state.write.mockImplementationOnce(() => new Promise<void>(r => { resolve = r; }));
  await mount(); await choose("ours"); const queued = state.callbacks.get("Conflict block {p0}")!;
  await click("Apply reviewed resolution"); await act(async () => state.confirmation!()); await act(async () => queued("theirs"));
  expect((container.querySelector('select[aria-label="Conflict block {p0}"]') as HTMLSelectElement).value).toBe("ours"); await act(async () => resolve());
});
