// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { GitStashes } from "./git-stashes";

const state = vi.hoisted(() => ({
  activeId: "machine", confirmation: undefined as undefined | (() => void),
  allowed: true, epoch: true, enabled: true, paused: false, pending: false, clear: true,
  queryError: null as Error | null, dismiss: undefined as undefined | (() => void),
  rows: [{ index: 3, sha: "a".repeat(40), message: "Reviewed stash", timestamp: 1700000000 }],
  field: null as null | { value: string; onChangeText: (value: string) => void },
  mode: null as null | { value: string; onChange: (value: string) => void },
  commands: new Map<string, () => void>(), closed: vi.fn(),
  error: null as null | Error,
  write: vi.fn(async (_params: unknown) => undefined), refetch: vi.fn(),
}));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children), BackHandler: { addEventListener: () => ({ remove() {} }) } }));
vi.mock("expo-router", () => ({ useFocusEffect: () => undefined }));
vi.mock("@/state/connection-scope", () => { const scope = { isCurrent: () => state.epoch }; return { useConnectionScope: () => scope }; });
vi.mock("@/ui/private-access", () => ({ usePrivateContentAccess: () => ({ allowed: state.allowed, check: () => state.allowed }), PrivateContentAccessProvider: ({ children }: PropsWithChildren) => children }));
vi.mock("@/ui/search-field", () => ({ CollectionToolbar: ({ field, actions }: { field: React.ReactNode; actions: React.ReactNode }) => createElement("section", null, field, actions) }));
vi.mock("@/ui/action-review-sheet", () => ({ ActionReviewSheet: ({ children, onConfirm, onClose }: PropsWithChildren<{ onConfirm: () => void; onClose: () => void }>) => {
  state.confirmation = onConfirm; state.dismiss = onClose; return createElement("aside", null, children);
} }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => undefined }));
vi.mock("@/ui/tokens", () => ({ space: { sm: 8 } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({ confirmAction: (_title: string, _text: string, _label: string, callback: () => void) => { state.confirmation = callback; } }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "machine", name: "Original computer", capabilities: ["workspace.run", "git.actions", ...(state.clear ? ["git.stash.clearSnapshot"] : [])] }), useMachines: { getState: () => ({ activeId: state.activeId }) } }));
vi.mock("@/state/queries", () => ({
  useHostQuery: () => ({ isSuccess: !state.queryError, isError: !!state.queryError, isEnabled: state.enabled, fetchStatus: state.paused ? "paused" : "idle", error: state.queryError, data: state.rows, refetch: state.refetch }),
  useHostMutation: () => ({ mutateAsync: state.write, error: state.error, isPending: state.pending }),
}));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => { state.commands.set(label, onPress); return createElement("button", { disabled, onClick: onPress }, label); };
  return { Stack: wrapper, Body: wrapper, Row: wrapper, Button: button, NavigationRow: button,
    QueryState: () => null, MutationState: () => null,
    ActionMenu: ({ actions }: { actions: Array<{ key: string; label: string; disabled?: boolean; onPress: () => void } | false> }) => createElement("nav", null, ...actions.filter(Boolean).map(a => { const item = a as Exclude<typeof a, false>; state.commands.set(item.label, item.onPress); return createElement("button", { key: item.key, disabled: item.disabled, onClick: item.onPress }, item.label); })),
    Field: (props: NonNullable<typeof state.field>) => { state.field = props; return createElement("input", { value: props.value, onChange: e => props.onChangeText(e.currentTarget.value) }); },
    SelectField: (props: NonNullable<typeof state.mode>) => { state.mode = props; return null; },
    FormActions: ({ submitLabel, onSubmit, onCancel, cancelLabel, disabled }: { submitLabel: string; onSubmit: () => void; onCancel: () => void; cancelLabel: string; disabled: boolean }) => createElement("footer", null, button({ label: submitLabel, onPress: onSubmit, disabled }), button({ label: cancelLabel, onPress: onCancel })),
    Notice: ({ message }: { message: string }) => createElement("div", null, message),
    Sheet: ({ visible, children }: PropsWithChildren<{ visible: boolean }>) => visible ? wrapper({ children }) : null,
    ScreenList: ({ header, actions, context, data, renderItem }: { header: React.ReactNode; actions: React.ReactNode; context: React.ReactNode; data: unknown[]; renderItem: (args: { item: unknown }) => React.ReactNode }) =>
      createElement("main", null, context, actions, header, ...data.map((item) => renderItem({ item }))),
  };
});
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root?.unmount()); state.commands.clear(); state.allowed = true; state.epoch = true; state.enabled = true; state.paused = false; state.pending = false; state.clear = true; state.queryError = null; state.dismiss = undefined; state.field = null; state.mode = null; state.rows = [{ index: 3, sha: "a".repeat(40), message: "Reviewed stash", timestamp: 1700000000 }]; state.activeId = "machine"; state.error = null; state.confirmation = undefined; vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  await act(async () => root.render(createElement(GitStashes, { scope: { projectId: "p", root: "/reviewed/worktree" }, onClose: state.closed, onBusyChange: vi.fn(), registerExit: vi.fn() })));
}
const click = (label: string) => act(() => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click());

it("requires confirmation then sends the reviewed SHA; an uncertain write cannot repeat", async () => {
  await mount();
  click("stash@{3}"); click("Apply and remove");
  expect(state.write).not.toHaveBeenCalled();
  await act(async () => state.confirmation!());
  expect(state.write).toHaveBeenCalledExactlyOnceWith({ command: "git_stash_action", args: { cwd: "/reviewed/worktree", action: "pop", index: 3, expectedSha: "a".repeat(40) } });
  state.error = Object.assign(new Error("Connection lost"), { uncertain: true });
  await act(async () => root.render(createElement(GitStashes, { scope: { projectId: "p", root: "/reviewed/worktree" }, onClose: vi.fn(), onBusyChange: vi.fn(), registerExit: vi.fn() })));
  expect(container.textContent).toContain("The result is uncertain");
  const create = [...container.querySelectorAll("button")].find((button) => button.textContent === "Create stash")!;
  expect(create.disabled).toBe(true);
});
it("does not retarget a confirmation after the selected computer changes", async () => {
  await mount(); click("stash@{3}"); click("Apply");
  state.activeId = "other-machine";
  await act(async () => state.confirmation!());
  expect(state.write).not.toHaveBeenCalled();
});
it("conceals a changed computer scope and explains original access rather than an update requirement", async () => {
  await mount(); click("stash@{3}"); state.activeId = "other-machine"; await rerender();
  expect(container.textContent).not.toContain("Reviewed stash"); expect(container.textContent).toContain("Record access is unavailable");
  expect(container.textContent).not.toContain("Update bycoda");
});

async function rerender() { await act(async () => root.render(createElement(GitStashes, { scope: { projectId: "p", root: "/reviewed/worktree" }, onClose: state.closed, onBusyChange: vi.fn(), registerExit: vi.fn() }))); }
it.each(["apply", "pop", "drop"] as const)("consumes a reviewed %s once with exact index/SHA and original checkout", async kind => {
  await mount(); click("stash@{3}"); click(kind === "apply" ? "Apply" : kind === "pop" ? "Apply and remove" : "Delete stash");
  expect(container.querySelector("aside")!.textContent).toContain("/reviewed/worktree");
  expect(container.querySelector("aside")!.textContent).toContain("a".repeat(40));
  const confirm = state.confirmation!; await act(async () => { confirm(); confirm(); });
  expect(state.write).toHaveBeenCalledExactlyOnceWith({ command: "git_stash_action", args: { cwd: "/reviewed/worktree", action: kind, index: 3, expectedSha: "a".repeat(40) } });
});
it("cancel preserves selection and full long stash message without writing", async () => {
  state.rows = [{ ...state.rows[0]!, message: "Long saved work. ".repeat(550) + "END-OF-STASH" }]; await mount(); click("stash@{3}"); click("Apply");
  expect(container.querySelector("aside")!.textContent).toContain(state.rows[0]!.message); const old = state.confirmation!;
  await act(async () => state.dismiss!()); expect(container.textContent).toContain(state.rows[0]!.message);
  await act(async () => old()); expect(state.write).not.toHaveBeenCalled();
});
it("bulk deletion reviews the exact snapshot and consumes it once", async () => {
  state.rows.push({ index: 7, sha: "b".repeat(40), message: "Second stash", timestamp: 1700000000 }); await mount(); click("Delete all stashes");
  expect(container.querySelector("aside")!.textContent).toContain("Second stash"); const old = state.confirmation!; await act(async () => { old(); old(); });
  expect(state.write).toHaveBeenCalledExactlyOnceWith({ command: "git_stash_clear", args: { cwd: "/reviewed/worktree", expectedShas: ["a".repeat(40), "b".repeat(40)] } });
});
it("does not expose bulk deletion without the snapshot capability", async () => {
  state.clear = false; await mount(); click("Delete all stashes"); expect(container.querySelector("aside")).toBeNull();
  await act(async () => state.commands.get("Delete all stashes")!()); expect(state.write).not.toHaveBeenCalled();
});
it("retires bulk review when snapshot capability is withdrawn and restored", async () => {
  await mount(); click("Delete all stashes"); const old = state.confirmation!; state.clear = false; await rerender();
  expect(container.querySelector("aside")).toBeNull(); state.clear = true; await rerender(); await act(async () => old()); expect(state.write).not.toHaveBeenCalled();
});
it.each(["removed", "reindexed", "refreshed"])("retires a review after its list is %s", async kind => {
  await mount(); click("stash@{3}"); click("Apply"); const old = state.confirmation!;
  state.rows = kind === "removed" ? [] : state.rows.map(item => ({ ...item, index: kind === "reindexed" ? 4 : item.index })); await rerender();
  expect(container.querySelector("aside")).toBeNull(); await act(async () => old()); expect(state.write).not.toHaveBeenCalled();
});
it.each(["access", "auth", "identity", "disabled", "paused", "epoch", "pending", "uncertain"])("retires retained review through %s loss and restoration", async kind => {
  await mount(); click("stash@{3}"); click("Apply"); const old = state.confirmation!;
  if (kind === "access") state.allowed = false;
  if (kind === "auth" || kind === "identity") state.queryError = Object.assign(new Error("Private read unavailable"), { kind });
  if (kind === "disabled") state.enabled = false;
  if (kind === "paused") state.paused = true;
  if (kind === "epoch") state.epoch = false;
  if (kind === "pending") state.pending = true;
  if (kind === "uncertain") state.error = Object.assign(new Error("Unknown result"), { uncertain: true });
  await rerender(); expect(container.querySelector("aside")).toBeNull();
  if (!["pending", "uncertain"].includes(kind)) expect(container.textContent).not.toContain("Reviewed stash");
  state.allowed = true; state.queryError = null; state.enabled = true; state.paused = false; state.epoch = true; state.pending = false; state.error = null;
  await rerender(); await act(async () => old()); expect(state.write).not.toHaveBeenCalled();
});
it("keeps an ordinary network cache readable but does not write until query recovery", async () => {
  await mount(); state.queryError = new Error("Network unavailable"); await rerender(); click("stash@{3}");
  expect(container.textContent).toContain("Reviewed stash"); click("Apply"); expect(container.querySelector("aside")).toBeNull();
});
it("creates with the reviewed mode/trimmed message once, and clears the completed draft", async () => {
  await mount(); click("Create stash"); await act(async () => state.field!.onChangeText(" retained description "));
  await act(async () => state.mode!.onChange("staged")); const send = state.commands.get("Create stash")!;
  await act(async () => { send(); send(); }); expect(state.write).toHaveBeenCalledExactlyOnceWith({ command: "git_stash", args: { cwd: "/reviewed/worktree", message: "retained description", mode: "staged" } });
  click("Create stash"); expect(state.field!.value).toBe(""); expect(state.mode!.value).toBe("untracked");
});
it("closing and reopening creation preserves its draft, while stale input/submit callbacks retire", async () => {
  await mount(); click("Create stash"); const oldField = state.field!, oldSubmit = state.commands.get("Create stash")!;
  await act(async () => { oldField.onChangeText("newer d"); oldField.onChangeText("newer draft"); });
  expect(state.field!.value).toBe("newer draft"); click("Cancel"); click("Create stash");
  await act(async () => oldField.onChangeText("retired editor")); expect(state.field!.value).toBe("newer draft");
  await act(async () => oldSubmit()); expect(state.write).not.toHaveBeenCalled();
});
it("conceals an open create draft through access loss and restores fields without resending", async () => {
  await mount(); click("Create stash"); await act(async () => state.field!.onChangeText("local private draft"));
  const send = state.commands.get("Create stash")!; state.allowed = false; await rerender(); expect(container.querySelector("input")).toBeNull();
  await act(async () => send()); expect(state.write).not.toHaveBeenCalled(); state.allowed = true; await rerender();
  expect(state.field!.value).toBe("local private draft"); await act(async () => send()); expect(state.write).not.toHaveBeenCalled();
});
it("does not erase a newer create draft through an old leave confirmation", async () => {
  await mount(); click("Create stash"); await act(async () => state.field!.onChangeText("first")); click("Back"); click("Back"); const old = state.confirmation!;
  click("Create stash"); await act(async () => state.field!.onChangeText("newer")); await act(async () => old()); expect(state.closed).not.toHaveBeenCalled(); expect(state.field!.value).toBe("newer");
});
it("retained review and row/refresh callbacks reject a detached or retired connection", async () => {
  await mount(); const row = state.commands.get("stash@{3}")!, refresh = state.commands.get("Refresh")!; click("stash@{3}"); click("Apply"); const old = state.confirmation!;
  state.epoch = false; await act(async () => { old(); row(); refresh(); }); expect(state.write).not.toHaveBeenCalled(); expect(state.refetch).not.toHaveBeenCalled();
  await act(async () => root.unmount()); await act(async () => old()); root = createRoot(container); expect(state.write).not.toHaveBeenCalled();
});
it.each(["access", "removed"])("a selection concealed by %s does not swallow the visible Back action", async kind => {
  await mount(); click("stash@{3}"); if (kind === "access") state.allowed = false; else state.rows = []; await rerender(); click("Back"); expect(state.closed).toHaveBeenCalledOnce();
});
it("retained Back cannot bypass a newer draft or leave after unmount", async () => {
  await mount(); const old = state.commands.get("Back")!; click("Create stash"); await act(async () => state.field!.onChangeText("retained draft"));
  await act(async () => old()); expect(state.closed).not.toHaveBeenCalled();
  const current = state.commands.get("Back")!; await act(async () => root.unmount()); await act(async () => current()); expect(state.closed).not.toHaveBeenCalled(); root = createRoot(container);
});
