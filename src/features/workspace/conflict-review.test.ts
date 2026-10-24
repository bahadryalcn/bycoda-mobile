// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ConflictReview } from "./conflict-review";
import { conflictParts } from "./conflict-review-model";
const state = vi.hoisted(() => ({ activeId: "machine", data: {} as Record<string, unknown>, write: vi.fn(), confirmation: undefined as undefined | (() => void), detail: "", busy: vi.fn(), refetch: vi.fn() }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/ui/tokens", () => ({ space: { sm: 8 } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./git-diff-viewer", () => ({ GitDiffViewer: ({ lines }: { lines: { text: string }[] }) => createElement("pre", null, lines.map((line) => line.text).join("\n")) }));
vi.mock("@/ui/confirm", () => ({ confirmAction: (_title: string, detail: string, _label: string, callback: () => void) => { state.confirmation = callback; state.detail = detail; } }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "machine", capabilities: ["git.selective.review"] }), useMachines: { getState: () => ({ activeId: state.activeId }) } }));
vi.mock("@/state/queries", () => ({ useHostMutation: () => ({ mutateAsync: state.write }), useHostQuery: () => ({ isSuccess: true, isFetching: false, data: state.data, refetch: state.refetch }) }));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label);
  return { Body: wrapper, Button: button, Row: wrapper, ErrorText: () => null, QueryState: () => null,
    Notice: ({ message }: { message: string }) => createElement("div", null, message),
    Sheet: ({ children, footer }: PropsWithChildren<{ footer: React.ReactNode }>) => createElement("div", null, children, footer),
    SelectField: ({ label, value, disabled, onChange, options }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void; options: { value: string; label: string }[] }) => createElement("select", { "aria-label": label, value, disabled, onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.target.value) }, options.map((option) => createElement("option", { key: option.value, value: option.value }, option.label))),
    ScreenList: ({ header, data, renderItem }: { header: React.ReactNode; data: unknown[]; renderItem: (args: { item: unknown }) => React.ReactNode }) => createElement("div", null, header, ...data.map((item, key) => createElement("div", { key }, renderItem({ item })))),
  };
});
const container = document.createElement("div"); let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root?.unmount()); state.activeId = "machine"; state.confirmation = undefined; vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function mount(missing = false) {
  const working = "context\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> incoming\nafter";
  state.data = { snapshot: "a".repeat(64), operation: "rebase", stages: { relative: "a.txt", path: "a.txt", kind: "both-modified", base: "base\n", ours: "ours\n", theirs: missing ? null : "theirs\n", binary: false, tooLarge: false, workingExists: !missing }, working: missing ? null : working, parts: missing ? null : conflictParts(working), workingError: null };
  state.refetch.mockImplementation(async () => ({ data: state.data, error: null }));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root = createRoot(container);
  await act(async () => root.render(createElement(ConflictReview, { scope: { projectId: "p", root: "/repo" }, path: "a.txt", onBusyChange: state.busy, onClose: vi.fn(), onChanged: vi.fn() })));
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
  await mount(true); await click("Use incoming version"); expect(state.detail).toContain("deletes the file");
  state.activeId = "other"; await act(async () => state.confirmation!()); expect(state.write).not.toHaveBeenCalled();
});
