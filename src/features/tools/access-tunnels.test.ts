// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AccessTunnels } from "./access-tunnels";
const state = vi.hoisted(() => ({ id: "machine", requests: [] as unknown[], uncertain: false, values: new Map<string, string>() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (key: string) => state.values.get(key) ?? null,
  setItem: async (key: string, value: string) => { state.values.set(key, value); },
  removeItem: async (key: string) => { state.values.delete(key); },
} }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: state.id, environmentId: "host", capabilities: ["tunnels.manage"] }), useMachines: { getState: () => ({ activeId: state.id, machines: [{ id: state.id, environmentId: "host" }] }) } }));
vi.mock("@/state/queries", () => ({ useHostMutation: (method: string) => ({ isPending: false, mutateAsync: async (params: unknown) => { state.requests.push({ method, params }); if (state.uncertain) throw { uncertain: true }; return {}; } }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => { const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label);
  return {
    Disclosure: Wrapper,
    FormActions: ({ submitLabel, onSubmit, disabled, busy, feedback }: { submitLabel: string; onSubmit: () => void; disabled?: boolean; busy?: boolean; feedback?: import("react").ReactNode }) => createElement("div", null, feedback, createElement("button", { disabled: disabled || busy, onClick: onSubmit }, submitLabel === "Review changes" ? submitLabel : "Confirm tunnel")), Body: Wrapper, Sheet: Wrapper, ErrorText: () => null, MutationState: () => null, Notice: ({ message }: { message: string }) => createElement("p", null, message), Button,
    Field: () => null, SelectField: () => null,
    ConfirmationCard: ({ disabled, onConfirm }: { disabled?: boolean; onConfirm: () => void }) => createElement(Button, { label: "Confirm tunnel", disabled, onPress: onConfirm }) }; });
let root: ReturnType<typeof createRoot> | undefined; let container: HTMLDivElement;
async function render(stop = false) { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container);
  await act(async () => root!.render(createElement(AccessTunnels, { target: { machineId: "machine", environmentId: "host" },
    overview: { providers: [{ provider: "cloudflare", installed: true, credential: "not-required" }], tunnels: [], publicReachability: "unverified" },
    ...(stop ? { tunnel: { id: "reviewed", provider: "cloudflare" as const, target: "host" as const, localUrl: "http://127.0.0.1:3000", startedAt: 1, state: "ready" as const, canStop: true } } : {}), onClose: vi.fn(), onUpdated: vi.fn() }))); }
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; state.id = "machine"; state.requests = []; state.uncertain = false; state.values.clear(); vi.unstubAllGlobals(); });
it("starts only after explicit review/confirmation and retires the durable intent on success", async () => {
  await render(); await click("Review changes"); expect(state.requests).toEqual([]); await click("Confirm tunnel");
  expect(state.requests).toEqual([{ method: "tunnels.start", params: { provider: "cloudflare", target: "host" } }]); expect(state.values.size).toBe(0);
});
it("blocks replay after unknown outcome even after closing and reopening the sheet", async () => {
  state.uncertain = true; await render(); await click("Review changes"); await click("Confirm tunnel"); await click("Confirm tunnel");
  expect(state.requests).toHaveLength(1); expect(state.values.size).toBe(1);
  await act(async () => root?.unmount()); await render(); await click("Review changes"); expect(state.requests).toHaveLength(1);
  expect(container.textContent).toContain("outcome is unknown");
});
it("stops only the reviewed tunnel and refuses a machine switch before confirmation", async () => {
  await render(true); await click("Review changes"); state.id = "other"; await click("Confirm tunnel"); expect(state.requests).toEqual([]);
  state.id = "machine"; await click("Confirm tunnel"); expect(state.requests).toEqual([]);
});

it("stops exactly the reviewed tunnel after a fresh explicit review", async () => {
  await render(true); await click("Review changes"); await click("Confirm tunnel");
  expect(state.requests).toEqual([{ method: "tunnels.stop", params: { id: "reviewed" } }]);
});
