// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DeviceRuntime } from "./device-runtime";
const state = vi.hoisted(() => ({ id: "machine", requests: [] as { method: string; params: unknown }[], queries: [] as { method: string; params: unknown }[], running: false, uncertain: false }));
vi.mock("expo-crypto", () => { let id = 0; return { randomUUID: () => String(++id) }; });
vi.mock("@/state/machines", () => {
  const machine = () => ({ id: state.id, environmentId: "host", capabilities: ["device.host", "devices.preview.mobile.v1"] });
  return { useActiveMachine: machine, useMachines: { getState: () => ({ activeId: state.id, machines: [machine()] }), subscribe: () => () => {} } };
});
vi.mock("@/state/queries", () => ({
  useHostQuery: (_key: unknown, method: string, params: unknown) => { state.queries.push({ method, params }); return { data: method === "devices.status" ? { installed: true, running: state.running } : method === "devices.preview.impact" ? { activeCount: 0, owned: [], otherActiveCount: 0 } : { checks: { sdk: true, device: false, tools: true, agentControl: false } }, refetch: vi.fn(), isFetching: false }; },
  useHostMutation: (method: string) => ({ isPending: false, mutateAsync: async (params: unknown) => { state.requests.push({ method, params }); if (state.uncertain) throw { uncertain: true }; return {}; } }),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label);
  return { StatusRow: ({label,children}: import("react").PropsWithChildren<{label:string}>) => createElement("div", null, label, children),
    Disclosure: Wrapper, Row: Wrapper, Stack: Wrapper,
    FormActions: ({ submitLabel, onSubmit, disabled, busy, feedback }: { submitLabel: string; onSubmit: () => void; disabled?: boolean; busy?: boolean; feedback?: import("react").ReactNode }) => createElement("div", null, feedback, createElement("button", { disabled: disabled || busy, onClick: onSubmit }, "Confirm")), Body: Wrapper, Sheet: Wrapper, QueryState: () => null, MutationState: () => null,
    Notice: ({ message }: { message: string }) => createElement("p", null, message), Button,
    ToggleField: ({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) => createElement("input", { "aria-label": label, type: "checkbox", checked: value, onChange: () => onChange(!value) }),
    ConfirmationCard: ({ disabled, onConfirm }: { disabled?: boolean; onConfirm: () => void }) => createElement(Button, { label: "Confirm", disabled, onPress: onConfirm }) };
});
let root: ReturnType<typeof createRoot> | undefined; let container: HTMLDivElement;
async function render() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container); await act(async () => root!.render(createElement(DeviceRuntime, { projectId: "project", deviceId: "device", onClose: vi.fn() }))); }
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; state.id = "machine"; state.requests = []; state.queries = []; state.running = false; state.uncertain = false; vi.unstubAllGlobals(); });
it("reads exact device preflight on open and requires a separate confirmation for setup with agent access off", async () => {
  await render(); expect(state.queries).toContainEqual({ method: "devices.preflight", params: { projectId: "project", deviceId: "device" } }); expect(state.requests).toEqual([]);
  await click("Set up device tools"); expect(state.requests).toEqual([]); expect(container.textContent).toContain("downloads and installs");
  await click("Confirm"); expect(state.requests).toEqual([{ method: "devices.setup", params: { projectId: "project", agentAccess: false } }]);
});
it("requires explicit permission selection for agent device control", async () => {
  await render(); await click("Set up device tools"); await act(async () => container.querySelector<HTMLInputElement>("input")!.click()); await click("Confirm");
  expect(state.requests[0].params).toEqual({ projectId: "project", agentAccess: true });
});
it("confirms global service stop impact and refuses stale machine confirmation", async () => {
  state.running = true; await render(); await click("Stop device service"); expect(container.textContent).toContain("affecting other device controls");
  state.id = "other"; await click("Confirm"); expect(state.requests).toEqual([]);
  state.id = "machine"; await click("Confirm"); expect(state.requests).toEqual([{ method: "devices.stop", params: { projectId: "project" } }]);
});
it("unknown service mutation prevents repeated confirmation", async () => {
  state.uncertain = true; await render(); await click("Start device service"); await click("Confirm"); await click("Confirm"); expect(state.requests).toHaveLength(1);
});
