// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { GitManagement } from "./git-management";
import type { GitManagementDraft } from "./git-management-model";

const state = vi.hoisted(() => ({
  activeId: "machine", confirmation: undefined as undefined | (() => void), text: "", error: null as Error | null,
  form: undefined as undefined | { value: GitManagementDraft; onChange: (draft: GitManagementDraft) => void; onSubmit: () => void },
  branch: "feature", head: "a".repeat(40), write: vi.fn(async (_params: unknown) => undefined),
  refetch: vi.fn(async () => ({ data: { branch: "feature", head: "a".repeat(40) } })),
  snapshotRefetch: vi.fn(async () => ({ data: { token: "e".repeat(64), refs: {} } })),
}));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children), BackHandler: { addEventListener: () => ({ remove() {} }) } }));
vi.mock("expo-router", () => ({ useFocusEffect: () => undefined }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/tokens", () => ({ space: { sm: 8 } }));
vi.mock("@/ui/confirm", () => ({ confirmAction: (_title: string, text: string, _label: string, callback: () => void) => { state.text = text; state.confirmation = callback; } }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "machine", name: "Reviewed PC", capabilities: ["workspace.run", "git.actions", "git.management.snapshot.v1"] }), useMachines: { getState: () => ({ activeId: state.activeId }) } }));
vi.mock("./git-queries", () => ({
  useGitIndex: () => ({ isSuccess: true, data: { branch: state.branch, head: state.head }, refetch: state.refetch }),
  useGitBranches: () => ({ isSuccess: true, data: { current: "feature", branches: ["feature"], remotes: [] }, refetch: vi.fn() }),
}));
vi.mock("@/state/queries", () => ({
  useHostQuery: (key: string[]) => ({ isSuccess: true, data: key.includes("snapshot") ? { token: "f".repeat(64), refs: {} } : [], refetch: key.includes("snapshot") ? state.snapshotRefetch : vi.fn() }),
  useHostMutation: () => ({ mutateAsync: state.write, error: state.error, isPending: false, reset: vi.fn() }),
}));
vi.mock("./git-management-form", async (importOriginal) => {
  const original = await importOriginal<typeof import("./git-management-form")>();
  return { ...original, GitManagementForm: (props: NonNullable<typeof state.form>) => { state.form = props; return null; } };
});
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label);
  return { Body: wrapper, Button: button, NavigationRow: button, QueryState: () => null, MutationState: () => null, ActionMenu: () => null,
    ErrorText: ({ error }: { error?: Error }) => createElement("span", null, error?.message), SearchField: () => null, SegmentedControl: () => null,
    Notice: ({ message }: { message: string }) => createElement("div", null, message),
    Sheet: ({ children }: PropsWithChildren) => wrapper({ children }),
    ScreenList: ({ header, data, renderItem }: { header: React.ReactNode; data: unknown[]; renderItem: (args: { item: unknown }) => React.ReactNode }) => createElement("div", null, header, ...data.map((item) => renderItem({ item }))),
  };
});
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root.unmount()); state.activeId = "machine"; state.branch = "feature"; state.head = "a".repeat(40); state.error = null; state.form = undefined; state.confirmation = undefined; vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  await act(async () => root.render(createElement(GitManagement, { scope: { projectId: "project", root: "/reviewed/worktree" }, onClose: vi.fn(), onBusyChange: vi.fn(), registerExit: vi.fn() })));
  act(() => [...container.querySelectorAll("button")].find((button) => button.textContent === "feature · HEAD")!.click());
  await act(async () => state.form!.onChange({ ...state.form!.value, target: "renamed" }));
  act(() => state.form!.onSubmit());
}

it("confirms the exact checkout, branch and HEAD then suppresses duplicate writes", async () => {
  await mount();
  expect(state.text).toContain("/reviewed/worktree"); expect(state.text).toContain("feature"); expect(state.text).toContain("a".repeat(40));
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
