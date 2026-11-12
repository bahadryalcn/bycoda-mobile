// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DevicePreviewSheet } from "./device-preview";
const state = vi.hoisted(() => ({ id: "machine", writes: [] as { method: string; params: Record<string, unknown> }[], reads: [] as { method: string; params: Record<string, unknown>; enabled: boolean }[], values: new Map<string, string>(), uncertain: false, failStorage: false, readError: false, failRead: 0 }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "request" }));vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (key: string) => { if (state.failRead > 0) { state.failRead -= 1; throw new Error("Storage read failed"); } return state.values.get(key) ?? null; },
  setItem: async (key: string, value: string) => { if (state.failStorage) throw new Error("Storage failed"); state.values.set(key, value); },
  removeItem: async (key: string) => { state.values.delete(key); },
} }));
vi.mock("@/state/machines", () => {
  const machine = () => ({ id: state.id, environmentId: "host", capabilities: ["devices.preview.mobile.v1"] });
  return { useActiveMachine: machine, useMachines: { getState: () => ({ activeId: state.id, machines: [machine()] }), subscribe: () => () => {} } };
});
vi.mock("@/state/queries", () => ({
  useHostQuery: (_key: unknown, method: string, params: Record<string, unknown>, options: { enabled: boolean }) => { state.reads.push({ method, params, enabled: options.enabled }); return { data: undefined, isError: state.readError, isFetching: false, refetch: vi.fn() }; },
  useHostMutation: (method: string) => ({ isPending: false, mutateAsync: async (params: Record<string, unknown>) => { state.writes.push({ method, params }); if (state.uncertain) throw { uncertain: true }; return { id: "job", requestId: params.requestId, deviceId: params.deviceId, state: "queued", verification: "launch-only", updatedAt: "2026-10-22T00:00:00Z", stages: [] }; } }),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/remote-frame", () => ({ RemoteFrame: () => null }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label);
  return {
    Disclosure: Wrapper, Stack: Wrapper, Row: Wrapper,
    IconButton: ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label),
    FormActions: ({ submitLabel, onSubmit, disabled, busy, feedback }: { submitLabel: string; onSubmit: () => void; disabled?: boolean; busy?: boolean; feedback?: import("react").ReactNode }) => createElement("div", null, feedback, createElement("button", { disabled: disabled || busy, onClick: onSubmit }, submitLabel === "Review changes" ? submitLabel : "Confirm")), Body: Wrapper, Sheet: Wrapper, QueryState: () => null, MutationState: () => null, ErrorText: () => null,
    Notice: ({ message, onRetry }: { message: string; onRetry?: () => void }) => createElement("div", null, createElement("p", null, message), onRetry ? createElement("button", { onClick: onRetry }, "Retry") : null), Button, Loading: () => null,
    Field: ({ label, onChangeText }: { label: string; onChangeText: (value: string) => void }) => createElement(Button, { label, onPress: () => onChangeText("exp://127.0.0.1:8081") }),
    ToggleField: () => null,
    ConfirmationCard: ({ disabled, onConfirm }: { disabled?: boolean; onConfirm: () => void }) => createElement(Button, { label: "Confirm", disabled, onPress: onConfirm }) };
});
let root: ReturnType<typeof createRoot> | undefined; let container: HTMLDivElement;
async function render() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container); await act(async () => root!.render(createElement(DevicePreviewSheet, { projectId: "project", device: { id: "sim", name: "Device", platform: "ios", version: "1", booted: true, physical: false }, onClose: vi.fn() }))); }
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; state.id = "machine"; state.writes = []; state.reads = []; state.values.clear(); state.uncertain = false; state.failStorage = false; state.readError = false; state.failRead = 0; vi.unstubAllGlobals(); });
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
const savedKey = "bycoda.device-preview.v1:machine:host:project:sim";
const savedIntent = { requestId: "saved-request", deviceId: "sim", url: "exp://127.0.0.1:8081", installExpoGo: false };
const buttons = () => [...container.querySelectorAll("button")].map((button) => button.textContent);
it("a rejected retained-intent read exposes in-place Retry, starts nothing, and recovers the same request ID", async () => {
  state.values.set(savedKey, JSON.stringify(savedIntent)); state.failRead = 1; await render();
  expect(container.textContent).toContain("Could not read the saved preview request"); expect(buttons()).not.toContain("Review changes"); expect(buttons()).not.toContain("Development server URL");
  expect(buttons()).not.toContain("Discard saved preview request"); expect(state.reads.some((row) => row.enabled)).toBe(false);
  await click("Retry");
  expect(container.textContent).toContain(savedIntent.url); expect(container.textContent).toContain("saved-request"); expect(buttons()).not.toContain("Review changes");
  expect(state.reads.some((row) => row.enabled && row.params.requestId === "saved-request")).toBe(true); expect(state.writes).toEqual([]); expect(state.values.get(savedKey)).toBe(JSON.stringify(savedIntent));
});
it("a failed read with nothing saved recovers to the empty form only after a successful retry", async () => {
  state.failRead = 1; await render(); expect(buttons()).not.toContain("Review changes"); await click("Retry");
  expect(buttons()).toContain("Review changes"); expect(state.writes).toEqual([]);
});
it("a malformed retained intent is never cleared or relaunched until an explicit reviewed discard", async () => {
  state.values.set(savedKey, "corrupt"); await render();
  expect(container.textContent).toContain("damaged"); expect(buttons()).not.toContain("Review changes"); expect(state.writes).toEqual([]); expect(state.values.get(savedKey)).toBe("corrupt");
  await click("Retry"); expect(state.values.get(savedKey)).toBe("corrupt"); expect(buttons()).not.toContain("Review changes");
  await click("Discard saved preview request"); expect(container.textContent).toContain("does not cancel the host job"); expect(state.values.get(savedKey)).toBe("corrupt");
  await click("Confirm"); expect(state.values.has(savedKey)).toBe(false); expect(buttons()).toContain("Review changes"); expect(state.writes).toEqual([]);
});
