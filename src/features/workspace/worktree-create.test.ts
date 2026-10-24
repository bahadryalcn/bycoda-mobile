// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { WorktreeCreate } from "./worktree-create";

const state = vi.hoisted(() => ({ activeId: "machine", confirmation: undefined as undefined | (() => void), write: vi.fn(), refetch: vi.fn(async () => undefined), beforeChange: vi.fn(async () => undefined), select: vi.fn() }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/ui/tokens", () => ({ space: { sm: 8 } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({ confirmAction: (_title: string, _detail: string, _label: string, callback: () => void) => { state.confirmation = callback; } }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "machine", capabilities: ["git.worktreeCreate"] }), useMachines: { getState: () => ({ activeId: state.activeId }) } }));
vi.mock("@/state/queries", () => ({
  useHostMutation: () => ({ mutateAsync: state.write }),
  useHostQuery: (_key: unknown, method: string) => ({ isSuccess: true, isError: false, data: method === "git.branches" ? { current: "main", branches: ["main"], remotes: [] } : { defaultRoot: "/host/worktrees", worktrees: [] }, refetch: state.refetch }),
}));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label);
  return { Body: wrapper, Button: button, QueryState: () => null, SelectField: () => null,
    Sheet: ({ visible, children }: PropsWithChildren<{ visible: boolean }>) => visible ? wrapper({ children }) : null,
    ErrorText: () => null, Notice: ({ message }: { message: string }) => createElement("div", null, message),
    Field: ({ value, onChangeText }: { value: string; onChangeText: (text: string) => void }) => createElement("input", { value, onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChangeText(event.target.value), onInput: (event: React.FormEvent<HTMLInputElement>) => onChangeText(event.currentTarget.value) }),
    FormActions: ({ submitLabel, disabled, onSubmit }: { submitLabel: string; disabled: boolean; onSubmit: () => void }) => button({ label: submitLabel, disabled, onPress: onSubmit }),
  };
});
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root?.unmount()); state.activeId = "machine"; state.confirmation = undefined; vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  await act(async () => root.render(createElement(WorktreeCreate, { scope: { machineId: "machine", projectId: "project", cwd: "/source" }, visible: true, blocked: false, beforeChange: state.beforeChange, onSelect: state.select, onClose: vi.fn() })));
  await act(async () => { const input = container.querySelector("input")!; input.value = "new-feature"; input.dispatchEvent(new Event("input", { bubbles: true })); });
}
it("confirms the frozen source and branch once and refuses retargeting to another machine", async () => {
  await mount();
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Create worktree")!.click());
  expect(state.write).not.toHaveBeenCalled(); expect(state.confirmation).toBeTypeOf("function");
  state.activeId = "different";
  await act(async () => state.confirmation!());
  expect(state.write).not.toHaveBeenCalled();
});
it("keeps an unknown creation latched while allowing read-only reconciliation", async () => {
  state.write.mockRejectedValueOnce(Object.assign(new Error("Disconnected"), { uncertain: true }));
  await mount();
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Create worktree")!.click());
  const confirm = state.confirmation!;
  await act(async () => confirm()); await act(async () => confirm());
  expect(state.write).toHaveBeenCalledExactlyOnceWith({ projectId: "project", cwd: "/source", branch: "new-feature", base: "HEAD", existing: false });
  expect(container.textContent).toContain("The create result is uncertain");
  expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Create worktree")!.disabled).toBe(true);
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Refresh working folders")!.click());
  expect(state.refetch).toHaveBeenCalledTimes(2); expect(state.write).toHaveBeenCalledTimes(1);
});
it("creates once and preserves the selected checkout when the existing draft guard refuses selection", async () => {
  state.write.mockResolvedValueOnce({ path: "/host/worktrees/wt-new-feature", branch: "new-feature", head: "a".repeat(40), isMain: false, missing: false });
  state.beforeChange.mockRejectedValueOnce(new Error("Keep current draft"));
  await mount();
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Create worktree")!.click());
  const confirm = state.confirmation!;
  await act(async () => confirm()); await act(async () => confirm());
  expect(state.write).toHaveBeenCalledTimes(1); expect(state.select).not.toHaveBeenCalled();
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Use this working folder")!.click());
  expect(state.beforeChange).toHaveBeenCalledTimes(1); expect(state.select).not.toHaveBeenCalled();
  expect(container.textContent).toContain("/host/worktrees/wt-new-feature");
});
