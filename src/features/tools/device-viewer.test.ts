// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DeviceViewer } from "./device-viewer";
const state = vi.hoisted(() => ({ id: "machine", writes: [] as { method: string; params: unknown }[], refresh: vi.fn(), finishBoot: undefined as undefined | ((value: unknown) => void) }));
vi.mock("lucide-react-native/icons/house", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("@/state/machines", () => {
  const machine = () => ({ id: state.id, environmentId: "host" });
  const useMachines = Object.assign(() => state.id, { getState: () => ({ activeId: state.id, machines: [machine()] }), subscribe: () => () => {} });
  return { useMachines, useActiveMachine: machine };
});
vi.mock("expo-crypto", () => { let id = 0; return { randomUUID: () => String(++id) }; });
vi.mock("@/state/queries", () => ({
  useHostQuery: () => ({ data: { mime: "image/png", base64: "YWJj" }, isFetching: false, refetch: state.refresh }),
  useHostMutation: (method: string) => ({ isPending: false, mutateAsync: async (params: unknown) => { state.writes.push({ method, params }); if (method === "devices.boot") return new Promise((resolve) => { state.finishBoot = resolve; }); return "ok"; } }),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/styles", () => ({ uiStyles: {} }));
vi.mock("@/ui/tokens", () => ({ colors: {} }));
vi.mock("./device-runtime", () => ({ DeviceRuntime: () => null }));
vi.mock("./device-preview", () => ({ DevicePreviewSheet: () => null }));
vi.mock("@/ui/remote-frame", () => ({ RemoteFrame: ({ onPress }: { onPress: (point: { x: number; y: number }) => void }) => createElement("button", { onClick: () => onPress({ x: 10, y: 20 }) }, "Frame") }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label);
  return {
    NavigationRow: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => createElement("button", { onClick: onPress, disabled }, label), Body: Wrapper, Sheet: Wrapper, Row: Wrapper, Disclosure: Wrapper, NavigationGroup: Wrapper, QueryState: () => null, MutationState: () => null, Notice: () => null, Badge: () => null, Field: () => null, Button, IconButton: Button,
    ToggleField: ({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) => createElement(Button, { label, onPress: () => onChange(!value) }) };
});
let root: ReturnType<typeof createRoot> | undefined; let container: HTMLDivElement; const onDevice = vi.fn();
async function render(booted: boolean) { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container); await act(async () => root!.render(createElement(DeviceViewer, { projectId: "project", device: { id: "device", name: "Device", platform: "android", version: "1", booted, physical: false }, canControl: true, onDevice, onClose: vi.fn() }))); }
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; state.id = "machine"; state.writes = []; state.refresh.mockClear(); state.finishBoot = undefined; onDevice.mockClear(); vi.unstubAllGlobals(); });
it("stale machine callbacks cannot capture or control the formerly selected device", async () => {
  await render(true); await click("Control device"); state.id = "other"; await click("Frame"); await click("Refresh screen");
  expect(state.writes).toEqual([]); expect(state.refresh).not.toHaveBeenCalled();
});
it("late boot completion cannot replace the selected device after a machine switch", async () => {
  await render(false); await click("Boot device"); expect(state.writes).toEqual([{ method: "devices.boot", params: { projectId: "project", deviceId: "device" } }]);
  state.id = "other"; await act(async () => state.finishBoot!({ id: "foreign-running-serial", booted: true })); expect(onDevice).not.toHaveBeenCalled();
});
