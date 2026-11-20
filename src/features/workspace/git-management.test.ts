// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { GitManagement } from "./git-management";
import type { GitManagementDraft } from "./git-management-model";

const state = vi.hoisted(() => ({
  allowed: true, epoch: true, pending: false, enabled: true, paused: false,
  dismiss: undefined as undefined | (() => void),
  tone: undefined as string | undefined,
  remotes: [{ kind: "remote", name: "origin", url: "https://user:synthetic@example.invalid/repo?token=synthetic" }],
  activeId: "machine", confirmation: undefined as undefined | (() => void), text: "", error: null as Error | null,
  form: undefined as undefined | { value: GitManagementDraft; onChange: (draft: GitManagementDraft) => void; onSubmit: () => void },
  branches: ["feature"], branch: "feature", head: "a".repeat(40), write: vi.fn(async (_params: unknown) => undefined),
  refetch: vi.fn(async () => ({ data: { branch: "feature", head: "a".repeat(40) } })),
  snapshotRefetch: vi.fn(async () => ({ data: { token: "e".repeat(64), refs: {} } })),
}));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children), BackHandler: { addEventListener: () => ({ remove() {} }) } }));
vi.mock("expo-router/react-navigation", () => ({ useIsFocused: () => false }));
vi.mock("expo-router", () => ({ useFocusEffect: () => undefined }));
vi.mock("@/state/connection-scope", () => { const scope = { isCurrent: () => state.epoch }; return { useConnectionScope: () => scope }; });
vi.mock("@/ui/private-access", () => ({ usePrivateContentAccess: () => ({ allowed: state.allowed, check: () => state.allowed }) }));
vi.mock("@/ui/action-review-sheet", () => ({ ActionReviewSheet: ({ children, onConfirm, onClose, tone }: PropsWithChildren<{ onConfirm: () => void; onClose: () => void; tone?: string }>) => {
  state.tone = tone; state.confirmation = onConfirm; state.dismiss = onClose; return createElement("aside", null, children);
} }));
vi.mock("@/i18n", () => ({ useLocale: () => "tr" }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/tokens", () => ({ space: { sm: 8 } }));
vi.mock("@/ui/confirm", () => ({ confirmAction: (_title: string, text: string, _label: string, callback: () => void) => { state.text = text; state.confirmation = callback; } }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "machine", name: "Reviewed PC", capabilities: ["workspace.run", "git.actions", "git.management.snapshot.v1"] }), useMachines: { getState: () => ({ activeId: state.activeId }) } }));
vi.mock("./git-queries", () => ({
  useGitIndex: () => ({ isSuccess: true, data: { branch: state.branch, head: state.head }, refetch: state.refetch }),
  useGitBranches: () => ({ isSuccess: true, data: { current: "feature", branches: state.branches, remotes: [] }, refetch: vi.fn() }),
}));
vi.mock("@/state/queries", () => ({
  useHostQuery: (key: string[]) => ({ isSuccess: true, isEnabled: state.enabled, fetchStatus: state.paused ? "paused" : "idle",
    data: key.includes("snapshot") ? { token: "f".repeat(64), refs: {} } : key.includes("pr-destination") ? "example.invalid/private/repo" : key.includes("remotes") ? state.remotes : [],
    refetch: key.includes("snapshot") ? state.snapshotRefetch : vi.fn() }),
  useHostMutation: () => ({ mutateAsync: state.write, error: state.error, isPending: state.pending, reset: vi.fn() }),
}));
vi.mock("./git-management-form", async (importOriginal) => {
  const original = await importOriginal<typeof import("./git-management-form")>();
  return { ...original, GitManagementForm: (props: NonNullable<typeof state.form>) => { state.form = props; return null; } };
});
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("lucide-react-native/icons/arrow-left", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/pencil", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/trash-2", () => ({ default: () => null }));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label);
  return { Stack: wrapper, Body: wrapper, Button: button, IconButton: button, Badge: wrapper, NavigationRow: button, QueryState: () => null, MutationState: () => null, ActionMenu: () => null,
    ErrorText: ({ error }: { error?: Error }) => createElement("span", null, error?.message), SearchField: ({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) => createElement("input", { "aria-label": label, value, onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChangeText(event.target.value) }),
    SegmentedControl: ({ options, onChange }: { options: Array<{ value: string; label: string }>; onChange: (v: string) => void }) => createElement("nav", null, ...options.map(o => createElement("button", { key: o.value, onClick: () => onChange(o.value) }, o.label))),
    Notice: ({ message }: { message: string }) => createElement("div", null, message), StateView: ({ title }: { title: string }) => createElement("div", null, title),
    Sheet: ({ children }: PropsWithChildren) => wrapper({ children }),
    ScreenList: ({ header, data, renderItem }: { header: React.ReactNode; data: unknown[]; renderItem: (args: { item: unknown }) => React.ReactNode }) => createElement("div", null, header, ...data.map((item) => renderItem({ item }))),
  };
});
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root.unmount()); state.allowed = true; state.epoch = true; state.pending = false; state.enabled = true; state.paused = false; state.dismiss = undefined; state.activeId = "machine"; state.branch = "feature"; state.branches = ["feature"]; state.head = "a".repeat(40); state.error = null; state.form = undefined; state.confirmation = undefined; vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  await act(async () => root.render(createElement(GitManagement, { scope: { projectId: "project", root: "/reviewed/worktree" }, onClose: vi.fn(), onBusyChange: vi.fn(), registerExit: vi.fn() })));
  act(() => [...container.querySelectorAll("button")].find((button) => button.textContent === "feature")!.click());
  await act(async () => state.form!.onChange({ ...state.form!.value, target: "renamed" }));
  act(() => state.form!.onSubmit());
}

it("confirms the exact checkout, branch and HEAD then suppresses duplicate writes", async () => {
  await mount();
  expect(container.textContent).toContain("/reviewed/worktree"); expect(container.textContent).toContain("feature"); expect(container.textContent).toContain("a".repeat(40));
  expect(state.write).not.toHaveBeenCalled();
  await act(async () => { state.confirmation!(); state.confirmation!(); });
  expect(state.write).toHaveBeenCalledExactlyOnceWith({ command: "git_rename_branch", args: { cwd: "/reviewed/worktree", from: "feature", to: "renamed", expectedSnapshot: "f".repeat(64) } });
});
it("does not retarget delayed confirmation after machine change", async () => {
  await mount(); state.activeId = "another-machine";
  await act(async () => state.confirmation!()); expect(state.write).not.toHaveBeenCalled();
});
it("rejects a changed HEAD discovered during final preflight", async () => {
  await mount(); state.refetch.mockResolvedValueOnce({ data: { branch: "feature", head: "b".repeat(40) } });
  await act(async () => state.confirmation!()); expect(state.write).not.toHaveBeenCalled();
  expect(container.textContent).toContain("The branch changed");
});

it("explicit refresh preserves the draft while capturing a new snapshot for final review", async () => {
  await mount();
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Refresh")!.click());
  expect(state.form!.value.target).toBe("renamed");
  act(() => state.form!.onSubmit());
  await act(async () => state.confirmation!());
  expect(state.write).toHaveBeenCalledExactlyOnceWith({ command: "git_rename_branch", args: { cwd: "/reviewed/worktree", from: "feature", to: "renamed", expectedSnapshot: "e".repeat(64) } });
});

async function rerender() {
  await act(async () => root.render(createElement(GitManagement, { scope: { projectId: "project", root: "/reviewed/worktree" }, onClose: vi.fn(), onBusyChange: vi.fn(), registerExit: vi.fn() })));
}
it("cancel preserves the editor and retires a retained confirmation", async () => {
  await mount(); const old = state.confirmation!; await act(async () => state.dismiss!());
  expect(state.form!.value.target).toBe("renamed"); expect(container.querySelector("aside")).toBeNull();
  await act(async () => old()); expect(state.write).not.toHaveBeenCalled();
});
it("reviews hard reset as a destructive action with its complete SHA, effect and warning", async () => {
  await mount(); await act(async () => state.dismiss!());
  await act(async () => state.form!.onChange({ ...state.form!.value, action: "reset", sha: "c".repeat(40), mode: "hard" }));
  await act(async () => state.form!.onSubmit()); expect(state.tone).toBe("danger");
  expect(container.querySelector("aside")!.textContent).toContain("Local tracked-file changes may be permanently discarded.");
  expect(container.querySelector("aside")!.textContent).toContain("Discard tracked file changes");
  await act(async () => state.confirmation!());
  expect(state.write).toHaveBeenCalledExactlyOnceWith({ command: "git_reset", args: { cwd: "/reviewed/worktree", sha: "c".repeat(40), mode: "hard", expectedSnapshot: "f".repeat(64) } });
});
it("an edited draft retires its previous review", async () => {
  await mount(); const old = state.confirmation!;
  await act(async () => state.form!.onChange({ ...state.form!.value, target: "newer" })); expect(container.querySelector("aside")).toBeNull();
  await act(async () => old()); expect(state.write).not.toHaveBeenCalled();
  await act(async () => state.form!.onSubmit()); await act(async () => state.confirmation!());
  expect(state.write.mock.calls[0]![0]).toMatchObject({ args: { to: "newer" } });
});
it("a stale form edit cannot replace a newer draft", async () => {
  await mount(); await act(async () => state.dismiss!()); const old = state.form!;
  await act(async () => old.onChange({ ...old.value, target: "newer" }));
  await act(async () => old.onChange({ ...old.value, target: "stale" })); expect(state.form!.value.target).toBe("newer");
});
it("a retained discard confirmation cannot erase an edited draft", async () => {
  await mount(); await act(async () => state.dismiss!());
  await act(async () => [...container.querySelectorAll("button")].find(b => b.textContent === "Back")!.click()); const old = state.confirmation!;
  await act(async () => state.form!.onChange({ ...state.form!.value, target: "newer" })); await act(async () => old());
  expect(state.form!.value.target).toBe("newer"); expect(container.querySelector("aside")).toBeNull();
});
it.each(["access", "epoch", "pending", "disabled", "paused", "uncertain"])("retires a pending review across %s loss and restoration", async (kind) => {
  await mount(); const old = state.confirmation!;
  if (kind === "access") state.allowed = false;
  if (kind === "epoch") state.epoch = false;
  if (kind === "pending") state.pending = true;
  if (kind === "disabled") state.enabled = false;
  if (kind === "paused") state.paused = true;
  if (kind === "uncertain") state.error = Object.assign(new Error("Unknown write"), { uncertain: true });
  await rerender(); expect(container.querySelector("aside")).toBeNull();
  state.allowed = true; state.epoch = true; state.pending = false; state.enabled = true; state.paused = false; state.error = null;
  await rerender(); await act(async () => old()); expect(state.write).not.toHaveBeenCalled();
});
it("rejects a connection epoch retired before React rerenders", async () => {
  await mount(); state.epoch = false; await act(async () => state.confirmation!()); expect(state.write).not.toHaveBeenCalled();
});
it("rejects a retained confirmation after unmount", async () => {
  await mount(); const old = state.confirmation!; await act(async () => root.unmount());
  await act(async () => old()); expect(state.write).not.toHaveBeenCalled(); root = createRoot(container);
});
it("rechecks lifetime when final preflight resolves after unmount", async () => {
  await mount(); let resolve!: (v: { data: { branch: string; head: string } }) => void;
  state.refetch.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await act(async () => state.confirmation!()); await act(async () => root.unmount());
  await act(async () => resolve({ data: { branch: "feature", head: "a".repeat(40) } }));
  expect(state.write).not.toHaveBeenCalled(); root = createRoot(container);
});
it("does not resume an accepted preflight after access was lost and restored while its index read was pending", async () => {
  await mount(); let resolve!: (v: { data: { branch: string; head: string } }) => void;
  state.refetch.mockImplementationOnce(() => new Promise(r => { resolve = r; })); await act(async () => state.confirmation!());
  state.allowed = false; await rerender(); state.allowed = true; await rerender();
  await act(async () => resolve({ data: { branch: "feature", head: "a".repeat(40) } })); expect(state.write).not.toHaveBeenCalled();
});
it("shows complete long PR content and sanitized remotes while sending the exact frozen payload", async () => {
  await mount(); await act(async () => state.dismiss!());
  await act(async () => state.form!.onChange({ ...state.form!.value, target: "" }));
  await act(async () => [...container.querySelectorAll("button")].find(b => b.textContent === "Back")!.click());
  await act(async () => [...container.querySelectorAll("button")].find(b => b.textContent === "PR")!.click());
  await act(async () => [...container.querySelectorAll("button")].find(b => b.textContent === "Create pull request")!.click());
  const body = "Full review text ".repeat(3000) + "EXACT-END";
  await act(async () => state.form!.onChange({ ...state.form!.value, title: "Original title", body, base: "main" }));
  await act(async () => state.form!.onSubmit());
  expect(container.querySelector("aside")!.textContent).toContain(body);
  expect(container.querySelector("aside")!.textContent).toContain("https://example.invalid/repo");
  expect(container.querySelector("aside")!.textContent).not.toContain("synthetic");
  await act(async () => state.confirmation!());
  expect(state.write.mock.calls[0]![0]).toMatchObject({ command: "git_pr_create", args: { title: "Original title", body, base: "main", head: "feature", repository: "example.invalid/private/repo", expectedSnapshot: "f".repeat(64) } });
});

it("keeps an untouched invalid draft silent and blocked, then reports the typed issue after an edit", async () => {
  root = createRoot(container);
  await act(async () => root.render(createElement(GitManagement, { scope: { projectId: "project", root: "/reviewed/worktree" }, onClose: vi.fn(), onBusyChange: vi.fn(), registerExit: vi.fn() })));
  act(() => [...container.querySelectorAll("button")].find((button) => button.textContent === "feature")!.click());
  expect(state.form).toMatchObject({ blocked: true, error: undefined });
  await act(async () => state.form!.onChange({ ...state.form!.value, target: "feature" }));
  expect(state.form).toMatchObject({ blocked: true, error: "Choose distinct valid branch names." });
  await act(async () => state.form!.onChange({ ...state.form!.value, target: "renamed" }));
  expect(state.form).toMatchObject({ blocked: false, error: undefined });
});

it("uses selected app locale for Git management branch filters without mutations", async () => {
  const lower = String.prototype.toLocaleLowerCase;
  vi.spyOn(String.prototype, "toLocaleLowerCase").mockImplementation(function (this: string, locale) { return lower.call(this, locale ?? "en"); });
  state.branches = ["feature", "İSTANBUL", "IĞDIR"];
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root = createRoot(container);
  await rerender(); const input = container.querySelector("input")!;
  for (const [query, expected] of [["istanbul", "İSTANBUL"], ["ığdır", "IĞDIR"]]) {
    await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, query); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(container.textContent).toContain(expected);
  }
  expect(state.write).not.toHaveBeenCalled(); expect(state.form).toBeUndefined();
});
