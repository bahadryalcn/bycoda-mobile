// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { contextualPendingKey, contextualPendingStore, useContextualDelivery } from "./handoff-delivery";
import { UncertainCommand } from "./commands";
const state = vi.hoisted(() => ({ records: new Map<string, string>(), nextId: 0,
  client: { machine: { id: "m", environmentId: "env" }, request: vi.fn() }, cache: { invalidateQueries: vi.fn() } }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: vi.fn(async (key: string) => state.records.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => { state.records.set(key, value); }),
  removeItem: vi.fn(async (key: string) => { state.records.delete(key); }),
} }));
vi.mock("expo-crypto", () => ({ randomUUID: () => `command-${++state.nextId}` }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => state.cache }));
vi.mock("@/state/queries", () => ({ useHostClient: () => state.client, hostKey: (machineId: string, keys: unknown[]) => [machineId, ...keys] }));
const scope = { machineId: "m", sessionId: "source" };
let hook: ReturnType<typeof useContextualDelivery>;
let root: ReturnType<typeof createRoot>;
const container = document.createElement("div");
function Harness() { hook = useContextualDelivery(scope, "project"); return null; }
async function mount() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root = createRoot(container); await act(async () => root.render(createElement(Harness))); }
async function unmount() { await act(async () => root.unmount()); }
afterEach(async () => { await unmount(); state.records.clear(); state.nextId = 0; state.client.machine.environmentId = "env"; vi.clearAllMocks(); vi.unstubAllGlobals(); });
it("retains unknown attempt identity through reopening and only reads its receipt; a later resolved intent may be repeated", async () => {
  state.client.request.mockImplementation(async (method: string) => {
    if (method === "commands.dispatch") throw new Error("connection interrupted");
    return null;
  });
  await mount();
  await act(async () => { await expect(hook.mutateAsync({ type: "contextual", previewDigest: "a".repeat(64) })).rejects.toBeInstanceOf(UncertainCommand); });
  const saved = JSON.parse(state.records.get(contextualPendingKey(scope))!);
  expect(Object.keys(saved).sort()).toEqual(["commandId", "digest", "environmentId"]);
  expect(saved.commandId).toBe("command-1");
  await unmount(); await mount();
  expect(hook.error).toBeInstanceOf(UncertainCommand);
  expect(state.client.request.mock.calls.filter(([method]) => method === "commands.dispatch")).toHaveLength(1);
  expect(state.client.request).toHaveBeenLastCalledWith("commands.status", { commandId: "command-1" });
  await act(async () => { await hook.acceptRecovered({ commandId: "command-1", sessionId: "original-destination", revision: 1 }); });
  expect(hook.receipt?.sessionId).toBe("original-destination");
  expect(state.records.has(contextualPendingKey(scope))).toBe(false);
  await unmount(); await mount();
  state.client.request.mockImplementation(async (_method: string, params: { commandId: string }) => ({ commandId: params.commandId, sessionId: "intentional-repeat", revision: 1 }));
  await act(async () => { await hook.mutateAsync({ type: "contextual", previewDigest: "a".repeat(64) }); });
  expect(hook.receipt?.sessionId).toBe("intentional-repeat");
  expect(state.client.request.mock.calls.filter(([method]) => method === "commands.dispatch")).toHaveLength(2);
});
it("does not query or dispatch a saved attempt through a different computer identity", async () => {
  state.records.set(contextualPendingKey(scope), JSON.stringify({ commandId: "original", digest: "a".repeat(64), environmentId: "old-env" }));
  await mount();
  expect(hook.error?.message).toContain("another computer identity");
  expect(state.client.request).not.toHaveBeenCalled();
  await expect(hook.mutateAsync({ previewDigest: "a".repeat(64) })).rejects.toThrow(/saved/);
});
it("serializes pending claims and never removes another attempt", async () => {
  await mount();
  const storage = { getItem: async (key: string) => state.records.get(key) ?? null,
    setItem: async (key: string, value: string) => { state.records.set(key, value); }, removeItem: async (key: string) => { state.records.delete(key); } };
  const first = contextualPendingStore(storage, "isolated"); const second = contextualPendingStore(storage, "isolated");
  const results = await Promise.all([first.claim({ commandId: "one", digest: "a".repeat(64) }), second.claim({ commandId: "two", digest: "b".repeat(64) })]);
  expect(results.map((result) => result.claimed)).toEqual([true, false]);
  expect(results[1]!.pending.commandId).toBe("one");
  await second.clear("two"); expect((await first.load())?.commandId).toBe("one");
});
