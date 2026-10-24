// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { GitSelective } from "./git-selective";
import { selectiveHunks } from "./git-selective-model";
import type { SelectiveReview } from "./git-selective-query";
const state = vi.hoisted(() => ({ activeId: "machine", confirmation: undefined as undefined | (() => void), write: vi.fn(), data: null as unknown as SelectiveReview, refetch: vi.fn(), busy: vi.fn() }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/ui/tokens", () => ({ space: { sm: 8 } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({ confirmAction: (_title: string, _detail: string, _label: string, callback: () => void) => { state.confirmation = callback; } }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "machine", capabilities: ["git.selective.review"] }), useMachines: { getState: () => ({ activeId: state.activeId }) } }));
vi.mock("@/state/queries", () => ({ useHostMutation: () => ({ mutateAsync: state.write }), useHostQuery: () => ({ isSuccess: true, isFetching: false, data: state.data, refetch: state.refetch }) }));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label);
  return { Body: wrapper, Button: button, ErrorText: () => null, QueryState: () => null,
    Notice: ({ message }: { message: string }) => createElement("div", null, message),
    Sheet: ({ visible, children, footer }: PropsWithChildren<{ visible: boolean; footer: React.ReactNode }>) => visible ? createElement("div", null, children, footer) : null,
    ToggleField: ({ label, value, disabled, onChange }: { label: string; value: boolean; disabled: boolean; onChange: (value: boolean) => void }) => createElement("input", { type: "checkbox", "aria-label": label, checked: value, disabled, onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.checked) }),
    ScreenList: ({ header, data, renderItem }: { header: React.ReactNode; data: unknown[]; renderItem: (args: { item: unknown }) => React.ReactNode }) => createElement("div", null, header, ...data.map((item, key) => createElement("div", { key }, renderItem({ item })))),
  };
});
const container = document.createElement("div"); let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root?.unmount()); state.activeId = "machine"; state.confirmation = undefined; vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function mount() {
  const original = "old\n"; const current = "new\n";
  state.data = { snapshot: "a".repeat(64), diff: { path: "a.txt", relative: "a.txt", original, current, status: "modified", binary: false, tooLarge: false }, hunks: selectiveHunks(original, current) };
  state.refetch.mockImplementation(async () => ({ data: state.data, error: null }));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root = createRoot(container);
  await act(async () => root.render(createElement(GitSelective, { scope: { projectId: "p", root: "/repo" }, path: "a.txt", visible: true, busy: false, onBusyChange: state.busy, onClose: vi.fn(), onChanged: vi.fn() })));
  await act(async () => (container.querySelector('input[aria-label="Hunk {p0}"]') as HTMLInputElement).click());
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Stage selected lines")!.click());
}
it("confirms exact reviewed bytes/snapshot and never replays an uncertain selection", async () => {
  state.write.mockRejectedValueOnce(Object.assign(new Error("Disconnected"), { uncertain: true }));
  await mount(); expect(state.write).not.toHaveBeenCalled(); const confirmation = state.confirmation!;
  await act(async () => confirmation()); await act(async () => confirmation());
  expect(state.write).toHaveBeenCalledExactlyOnceWith({ command: "git_stage_contents", args: { cwd: "/repo", relative: "a.txt", contents: "new\n", expectedOriginal: "old\n", expectedCurrent: "new\n", expectedSnapshot: "a".repeat(64) } });
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Review current diff")!.click());
  expect(state.write).toHaveBeenCalledTimes(1); expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Stage selected lines")!.disabled).toBe(true);
  expect(container.querySelectorAll("textarea,input:not([type=checkbox])")).toHaveLength(0);
});
it("does not retarget a delayed confirmation after the selected machine changes", async () => {
  await mount(); state.activeId = "other"; await act(async () => state.confirmation!()); expect(state.write).not.toHaveBeenCalled();
});
