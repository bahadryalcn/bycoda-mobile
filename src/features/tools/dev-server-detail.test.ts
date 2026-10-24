// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DevServerDetail } from "./dev-server-detail";
const state = vi.hoisted(() => ({ id: "machine", requests: [] as { method: string; params: unknown }[],
  uncertain: false, force: false, refetch: vi.fn(async () => ({ isError: false })) }));
const server = { id: "web", projectId: "project", managed: true, association: "managed" as const, name: "Web", state: "running" as const,
  endpoints: [{ address: "127.0.0.1", port: 3000, url: "http://127.0.0.1:3000" }], logsAvailable: false,
  process: { pid: 101, startedAt: "birth", name: "node" } };
vi.mock("@/state/machines", () => ({
  useMachines: Object.assign((fn: (value: { activeId: string }) => unknown) => fn({ activeId: state.id }), { getState: () => ({ activeId: state.id }) }),
  useActiveMachine: () => ({ capabilities: ["dev.servers.reviewed-impact"] }),
}));
vi.mock("./browser-screen", () => ({ BrowserScreen: () => null }));
vi.mock("@/state/queries", () => ({
  useHostQuery: () => ({ data: { server, descendants: [{ pid: 102, startedAt: "child", name: "worker" }], affectedPorts: [3000], expectedImpact: "b".repeat(64) }, isSuccess: true, refetch: state.refetch }),
  useHostMutation: (method: string) => ({ isPending: false, reset: () => {}, data: method === "devServers.stop" && state.force ? { requiresForce: true } : undefined,
    mutateAsync: async (params: unknown) => { state.requests.push({ method, params }); if (state.uncertain) throw { uncertain: true }; return { requiresForce: true }; } }),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => createElement("button", { onClick: onPress, disabled }, label);
  return { Body: Wrapper, Row: Wrapper, Sheet: Wrapper, NavigationGroup: Wrapper, CodePanel: Wrapper, CodeText: Wrapper,
    Button, QueryState: () => null, MutationState: () => null, ErrorText: () => null, ToggleField: () => null,
    Notice: ({ message }: { message: string }) => createElement("p", null, message),
    ConfirmationCard: ({ confirmLabel, onConfirm, disabled }: { confirmLabel: string; onConfirm: () => void; disabled?: boolean }) => createElement(Button, { label: `Confirm ${confirmLabel}`, onPress: onConfirm, disabled }),
  };
});
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
async function render() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (!root) { container = document.createElement("div"); root = createRoot(container); }
  await act(async () => root!.render(createElement(DevServerDetail, { projectId: "project", server, onClose: vi.fn() })));
}
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent === label)!;
  await act(async () => button.click());
}
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; state.requests = []; state.id = "machine"; state.uncertain = false; state.force = false; vi.unstubAllGlobals(); });
it("shows exact process/port impact before force and sends the frozen review token only on confirmation", async () => {
  state.force = true; await render(); await click("Force stop");
  expect(state.requests).toEqual([]);
  expect(container.textContent).toContain("PID 102"); expect(container.textContent).toContain("3000");
  await click("Confirm Force stop");
  expect(state.requests).toEqual([{ method: "devServers.kill", params: { projectId: "project", id: "web", tree: true,
    identity: { pid: 101, startedAt: "birth" }, expectedImpact: "b".repeat(64) } }]);
});
it("rejects confirmation after machine change", async () => {
  await render(); await click("Stop"); state.id = "other"; await click("Confirm Stop");
  expect(state.requests).toEqual([]);
});
it("does not resend uncertain writes until explicit successful state reconciliation", async () => {
  state.uncertain = true; await render(); await click("Stop"); await click("Confirm Stop");
  expect(state.requests).toHaveLength(1); expect(container.textContent).toContain("outcome is unknown");
  await click("Confirm Stop"); expect(state.requests).toHaveLength(1);
  await click("Refresh state"); state.uncertain = false; await click("Stop"); await click("Confirm Stop");
  expect(state.requests).toHaveLength(2);
});
