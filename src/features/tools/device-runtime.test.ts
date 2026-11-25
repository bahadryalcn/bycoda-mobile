// @vitest-environment jsdom
import { act, createElement, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DeviceRuntime } from "./device-runtime";
const state = vi.hoisted(() => ({
  id: "machine", requests: [] as { method: string; params: unknown }[], queries: [] as { method: string; params: unknown }[],
  installed: true, running: false, uncertain: false, statusKnown: true, statusFetching: false, statusError: false, activeCount: 0,
}));
vi.mock("expo-crypto", () => { let id = 0; return { randomUUID: () => String(++id) }; });
vi.mock("@/state/machines", () => {
  const machine = () => ({ id: state.id, environmentId: "host", capabilities: ["device.host", "devices.preview.mobile.v1"] });
  return { useActiveMachine: machine, useMachines: { getState: () => ({ activeId: state.id, machines: [machine()] }), subscribe: () => () => {} } };
});
vi.mock("@/state/queries", () => ({
  useHostQuery: (_key: unknown, method: string, params: unknown) => {
    state.queries.push({ method, params });
    const data = method === "devices.status"
      ? state.statusKnown ? { installed: state.installed, running: state.running } : undefined
      : method === "devices.preview.impact" ? { activeCount: state.activeCount, owned: [], otherActiveCount: 0 }
        : { checks: { sdk: true, device: true, tools: state.installed, agentControl: false } };
    return {
      data,
      refetch: vi.fn(),
      isFetching: method === "devices.status" && state.statusFetching,
      error: method === "devices.status" && state.statusError ? new Error("Status unreachable") : null,
    };
  },
  useHostMutation: (method: string) => ({ isPending: false, mutateAsync: async (params: unknown) => { state.requests.push({ method, params }); if (state.uncertain) throw { uncertain: true }; return {}; } }),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, disabled, onPress, tone }: { label: string; disabled?: boolean; onPress: () => void; tone?: string }) =>
    createElement("button", { disabled, onClick: onPress, "data-tone": tone }, label);
  return { StatusText: ({ label }: { label: string }) => createElement("span", null, label), ScopeLine: () => null, StatusRow: ({label,children}: import("react").PropsWithChildren<{label:string}>) => createElement("div", null, label, children),
    Disclosure: ({ label, children }: PropsWithChildren<{ label: string }>) => {
      const [expanded, setExpanded] = useState(false);
      return createElement("div", null, createElement("button", { onClick: () => setExpanded(!expanded) }, label), expanded ? children : null);
    },
    Row: Wrapper, Stack: Wrapper, IconButton: ({ label, onPress }: { label: string; onPress: () => void }) => createElement("button", { onClick: onPress }, label),
    FormActions: ({ submitLabel, onSubmit, disabled, busy, feedback }: { submitLabel: string; onSubmit: () => void; disabled?: boolean; busy?: boolean; feedback?: import("react").ReactNode }) => createElement("div", null, feedback, createElement("button", { disabled: disabled || busy, onClick: onSubmit }, "Confirm")), Body: Wrapper, Sheet: Wrapper, QueryState: () => null, MutationState: () => null,
    Notice: ({ message }: { message: string }) => createElement("p", null, message), Button,
    ToggleField: ({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) => createElement("input", { "aria-label": label, type: "checkbox", checked: value, onChange: () => onChange(!value) }),
    ConfirmationCard: ({ disabled, onConfirm }: { disabled?: boolean; onConfirm: () => void }) => createElement(Button, { label: "Confirm", disabled, onPress: onConfirm }) };
});
let root: ReturnType<typeof createRoot> | undefined; let container: HTMLDivElement;
async function render() {
  if (!root) { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container); }
  await act(async () => root!.render(createElement(DeviceRuntime, { projectId: "project", deviceId: "device", onClose: vi.fn() })));
}
const button = (label: string) => [...container.querySelectorAll("button")].find((control) => control.textContent === label);
async function click(label: string) { await act(async () => button(label)!.click()); }
function visibleServiceActions() {
  return ["Set up device tools", "Start device service", "Stop device service"].filter((label) => button(label));
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  Object.assign(state, { id: "machine", requests: [], queries: [], installed: true, running: false, uncertain: false, statusKnown: true, statusFetching: false, statusError: false, activeCount: 0 });
  vi.unstubAllGlobals();
});
it("shows setup as the sole primary service action when tools are missing", async () => {
  state.installed = false;
  await render();
  expect(visibleServiceActions()).toEqual(["Set up device tools"]);
  expect(button("Set up device tools")!.dataset.tone).toBe("primary");
});
it("shows Start while stopped; Confirm for agent access appears only after the toggle changes", async () => {
  await render();
  expect(visibleServiceActions()).toEqual(["Start device service"]);
  expect(button("Confirm")).toBeUndefined();
  await act(async () => (container.querySelector('input[aria-label="Let agents use devices"]') as HTMLInputElement).click());
  await click("Confirm");
  expect(state.requests).toEqual([{ method: "devices.setup", params: { projectId: "project", agentAccess: true } }]);
});
it("shows Stop only for a running service with a confirmed empty preview queue", async () => {
  state.running = true;
  state.activeCount = 1;
  await render();
  expect(visibleServiceActions()).toEqual([]);
  state.activeCount = 0;
  await render();
  expect(visibleServiceActions()).toEqual(["Stop device service"]);
});
it("waits for the status read before offering a service action", async () => {
  state.statusKnown = false;
  state.statusFetching = true;
  await render();
  expect(visibleServiceActions()).toEqual([]);
});
it("blocks a cached action while refreshing and suppresses it if the status read fails", async () => {
  state.statusFetching = true;
  await render();
  expect(button("Start device service")!.disabled).toBe(true);
  state.statusFetching = false;
  state.statusError = true;
  await render();
  expect(visibleServiceActions()).toEqual([]);
  expect(button("Refresh")).toBeDefined();
  state.statusError = false;
  await render();
  expect(button("Start device service")!.disabled).toBe(false);
});
it("blocks confirmation if service state changes during review", async () => {
  await render();
  await click("Start device service");
  state.running = true;
  await render();
  expect(button("Confirm")!.disabled).toBe(true);
  await click("Confirm");
  expect(state.requests).toEqual([]);
});
it("reads exact device preflight on open and requires a separate confirmation for setup with agent access off", async () => {
  state.installed = false;
  await render(); expect(state.queries).toContainEqual({ method: "devices.preflight", params: { projectId: "project", deviceId: "device" } }); expect(state.requests).toEqual([]);
  await click("Set up device tools"); expect(state.requests).toEqual([]); expect(container.textContent).toContain("downloaded and installed");
  await click("Confirm"); expect(state.requests).toEqual([{ method: "devices.setup", params: { projectId: "project", agentAccess: false } }]);
});
it("requires explicit permission selection for agent device control", async () => {
  state.installed = false;
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
