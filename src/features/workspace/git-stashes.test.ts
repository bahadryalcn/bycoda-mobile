// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { GitStashes } from "./git-stashes";

const state = vi.hoisted(() => ({
  activeId: "machine", confirmation: undefined as undefined | (() => void),
  error: null as null | Error,
  write: vi.fn(async (_params: unknown) => undefined), refetch: vi.fn(),
}));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children), BackHandler: { addEventListener: () => ({ remove() {} }) } }));
vi.mock("expo-router", () => ({ useFocusEffect: () => undefined }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => undefined }));
vi.mock("@/ui/tokens", () => ({ space: { sm: 8 } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({ confirmAction: (_title: string, _text: string, _label: string, callback: () => void) => { state.confirmation = callback; } }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "machine", capabilities: ["workspace.run", "git.actions"] }), useMachines: { getState: () => ({ activeId: state.activeId }) } }));
vi.mock("@/state/queries", () => ({
  useHostQuery: () => ({ isSuccess: true, isError: false, data: [{ index: 3, sha: "a".repeat(40), message: "Reviewed stash", timestamp: 1700000000 }], refetch: state.refetch }),
  useHostMutation: () => ({ mutateAsync: state.write, error: state.error, isPending: false }),
}));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label);
  return { Body: wrapper, Row: wrapper, Button: button, NavigationRow: button,
    QueryState: () => null, MutationState: () => null, ActionMenu: () => null, Field: () => null, SelectField: () => null, FormActions: () => null,
    Notice: ({ message }: { message: string }) => createElement("div", null, message),
    Sheet: ({ visible, children }: PropsWithChildren<{ visible: boolean }>) => visible ? wrapper({ children }) : null,
    ScreenList: ({ header, data, renderItem }: { header: React.ReactNode; data: unknown[]; renderItem: (args: { item: unknown }) => React.ReactNode }) =>
      createElement("div", null, header, ...data.map((item) => renderItem({ item }))),
  };
});
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root?.unmount()); state.activeId = "machine"; state.error = null; state.confirmation = undefined; vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  await act(async () => root.render(createElement(GitStashes, { scope: { projectId: "p", root: "/reviewed/worktree" }, onClose: vi.fn(), onBusyChange: vi.fn(), registerExit: vi.fn() })));
}
const click = (label: string) => act(() => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click());

it("requires confirmation then sends the reviewed SHA; an uncertain write cannot repeat", async () => {
  await mount();
  click("Reviewed stash"); click("Apply and remove");
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
  await mount(); click("Reviewed stash"); click("Apply");
  state.activeId = "other-machine";
  await act(async () => state.confirmation!());
  expect(state.write).not.toHaveBeenCalled();
});
