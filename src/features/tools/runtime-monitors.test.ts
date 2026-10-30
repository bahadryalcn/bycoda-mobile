// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { RuntimeMonitors } from "./runtime-monitors";
const state = vi.hoisted(() => ({ machineId: "machine-a", active: true, data: [{ id: "monitor", projectId: "project", url: "http://localhost:3000/", sourceId: "source" }], error: null as unknown, pending: false, methods: [] as string[], requests: [] as unknown[], refetch: vi.fn(async () => ({ isError: false })) }));
vi.mock("@/state/machines", () => ({ useMachines: Object.assign((fn: (value: unknown) => unknown) => fn({ activeId: state.machineId }), { getState: () => ({ activeId: state.machineId }) }) }));
vi.mock("@/state/queries", () => ({
  useHostReadActive: () => state.active,
  useHostQuery: (_key: unknown, method: string) => { state.methods.push(method); return { data: state.data, refetch: state.refetch }; },
  useHostMutation: (method: string) => ({ isPending: state.pending, error: state.error, reset: () => { state.error = null; }, mutateAsync: async (params: unknown) => { state.requests.push({ method, params }); } }),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    FormActions: ({ submitLabel, onSubmit, disabled, busy, feedback }: { submitLabel: string; onSubmit: () => void; disabled?: boolean; busy?: boolean; feedback?: import("react").ReactNode }) => createElement("div", null, feedback, createElement("button", { disabled: disabled || busy, onClick: onSubmit }, submitLabel)), Body: Wrapper, NavigationGroup: Wrapper, Sheet: Wrapper, QueryState: () => null, MutationState: () => null, ErrorText: () => null,
    Notice: ({ message }: { message: string }) => createElement("p", null, message),
    Button: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => createElement("button", { onClick: onPress, disabled }, label),
    NavigationRow: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => createElement("button", { onClick: onPress, disabled }, label),
    Field: ({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) => createElement("input", { value, onChange: (event: import("react").ChangeEvent<HTMLInputElement>) => onChangeText(event.target.value) }),
    ConfirmationCard: ({ confirmLabel, onConfirm, disabled }: { confirmLabel: string; onConfirm: () => void; disabled?: boolean }) => createElement("button", { onClick: onConfirm, disabled }, confirmLabel),
  };
});
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
async function render() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (!root) { container = document.createElement("div"); root = createRoot(container); }
  await act(async () => root!.render(createElement(RuntimeMonitors, { projectId: "project", onClose: vi.fn() })));
}
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent === label)!;
  await act(async () => button.click());
}
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; state.error = null; state.active = true; state.machineId = "machine-a"; state.requests = []; state.methods = []; vi.unstubAllGlobals(); });
it("lists without starting capture; stop requires explicit confirmation and exact project/id", async () => {
  await render();
  expect(state.requests).toEqual([]);
  expect(state.methods).toEqual(["runtimeLogs.monitors.list"]);
  await click("http://localhost:3000/"); expect(state.requests).toEqual([]);
  await click("Stop");
  expect(state.requests).toEqual([{ method: "runtimeLogs.monitors.stop", params: { projectId: "project", id: "monitor" } }]);
});
it("blocks writes after uncertain delivery until an explicit successful refresh", async () => {
  state.error = { uncertain: true }; await render();
  expect(container.textContent).toContain("outcome is unknown");
  await click("http://localhost:3000/"); expect(state.requests).toEqual([]);
  await click("Refresh");
  await click("http://localhost:3000/"); await click("Stop");
  expect(state.requests).toHaveLength(1);
});
it("does not retarget a confirmation after the active machine changes", async () => {
  await render(); await click("http://localhost:3000/");
  state.machineId = "machine-b";
  await click("Stop");
  expect(state.requests).toEqual([]);
});
