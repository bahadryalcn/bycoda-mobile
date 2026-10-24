// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DevicePreviewSheet } from "./device-preview";
const state = vi.hoisted(() => ({ id: "machine", writes: [] as { method: string; params: Record<string, unknown> }[], reads: [] as { method: string; params: Record<string, unknown>; enabled: boolean }[], values: new Map<string, string>(), uncertain: false, failStorage: false, readError: false }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "request" }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (key: string) => state.values.get(key) ?? null,
  setItem: async (key: string, value: string) => { if (state.failStorage) throw new Error("Storage failed"); state.values.set(key, value); },
  removeItem: async (key: string) => { state.values.delete(key); },
} }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: state.id, environmentId: "host", capabilities: ["devices.preview.mobile.v1"] }), useMachines: { getState: () => ({ activeId: state.id }) } }));
vi.mock("@/state/queries", () => ({
  useHostQuery: (_key: unknown, method: string, params: Record<string, unknown>, options: { enabled: boolean }) => { state.reads.push({ method, params, enabled: options.enabled }); return { data: undefined, isError: state.readError, isFetching: false, refetch: vi.fn() }; },
  useHostMutation: (method: string) => ({ isPending: false, mutateAsync: async (params: Record<string, unknown>) => { state.writes.push({ method, params }); if (state.uncertain) throw { uncertain: true }; return { id: "job", requestId: params.requestId, deviceId: params.deviceId, state: "queued", verification: "launch-only", updatedAt: "2026-10-22T00:00:00Z", stages: [] }; } }),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/remote-frame", () => ({ RemoteFrame: () => null }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label);
  return { Body: Wrapper, Sheet: Wrapper, QueryState: () => null, MutationState: () => null, ErrorText: () => null,
    Notice: ({ message }: { message: string }) => createElement("p", null, message), Button,
    Field: ({ label, onChangeText }: { label: string; onChangeText: (value: string) => void }) => createElement(Button, { label, onPress: () => onChangeText("exp://127.0.0.1:8081") }),
    ToggleField: () => null,
    ConfirmationCard: ({ disabled, onConfirm }: { disabled?: boolean; onConfirm: () => void }) => createElement(Button, { label: "Confirm", disabled, onPress: onConfirm }) };
});
let root: ReturnType<typeof createRoot> | undefined; let container: HTMLDivElement;
async function render() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container); await act(async () => root!.render(createElement(DevicePreviewSheet, { projectId: "project", device: { id: "sim", name: "Device", platform: "ios", version: "1", booted: true, physical: false }, onClose: vi.fn() }))); }
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; state.id = "machine"; state.writes = []; state.reads = []; state.values.clear(); state.uncertain = false; state.failStorage = false; state.readError = false; vi.unstubAllGlobals(); });
it("never starts on read; explicit review and confirmation persist exact request before launch with installation off", async () => {
  await render(); expect(state.writes).toEqual([]); await click("Development server URL"); await click("Review changes"); expect(state.values.size).toBe(0); await click("Confirm");
  expect(state.values.size).toBe(1); expect(state.writes).toEqual([{ method: "devices.preview.mobile.start", params: { projectId: "project", requestId: "request", deviceId: "sim", url: "exp://127.0.0.1:8081", installExpoGo: false } }]);
});
it("restores an unknown request through status reads only, and local tracking removal never relaunches it", async () => {
  state.uncertain = true; await render(); await click("Development server URL"); await click("Review changes"); await click("Confirm"); expect(state.writes).toHaveLength(1);
  await act(async () => root?.unmount()); root = undefined; state.readError = true; await render();
  expect(state.reads.some((row) => row.enabled && row.method === "devices.preview.mobile.status" && row.params.requestId === "request")).toBe(true);
  expect(state.writes).toHaveLength(1); await click("Remove unavailable tracking"); expect(container.textContent).toContain("does not cancel the host job"); await click("Confirm");
  expect(state.values.size).toBe(0); expect(state.writes).toHaveLength(1);
});
it("machine switch or storage failure prevents a new preview dispatch", async () => {
  await render(); await click("Development server URL"); await click("Review changes"); state.id = "other"; await click("Confirm"); expect(state.writes).toEqual([]);
  state.id = "machine"; state.failStorage = true; await click("Confirm"); expect(state.writes).toEqual([]); expect(state.values.size).toBe(0);
});
