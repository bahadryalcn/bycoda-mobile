// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DevicePermissionSettings } from "./device-permission-settings";

const mocks = vi.hoisted(() => ({ read: vi.fn(), allow: vi.fn(), settings: vi.fn(), test: vi.fn(), listeners: [] as ((state: string) => void)[] }));
vi.mock("react-native", () => ({
  Linking: { openSettings: mocks.settings },
  AppState: { addEventListener: (_event: string, listener: (state: string) => void) => { mocks.listeners.push(listener); return { remove: () => { mocks.listeners.splice(mocks.listeners.indexOf(listener), 1); } }; } },
}));
vi.mock("./device-permissions", () => ({ readDevicePermission: mocks.read, allowDevicePermission: mocks.allow, testDeviceNotification: mocks.test }));
vi.mock("@/state/actions", async () => {
  const { useCallback, useRef, useState } = await import("react");
  const { createSingleFlight } = await import("@/state/single-flight");
  return { useAsyncAction: () => {
    const [isPending, setPending] = useState(false); const flight = useRef(createSingleFlight<unknown>());
    const run = useCallback((action: () => Promise<unknown>) => flight.current.run(async () => { setPending(true); try { return await action(); } catch { return undefined; } finally { setPending(false); } }), []);
    return { isPending, run, error: null, isError: false, isSuccess: false };
  } };
});
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Body: Wrapper, Stack: Wrapper, NavigationGroup: Wrapper, Disclosure: Wrapper, MutationState: () => null, ErrorText: () => null,
    NavigationRow: ({ label, detail, disabled, onPress }: { label: string; detail: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, `${label}: ${detail}`),
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => createElement("button", { onClick: onPress }, label),
    FormActions: ({ submitLabel, disabled, feedback }: { submitLabel: string; disabled?: boolean; feedback?: ReactNode }) => createElement("div", null, feedback, createElement("button", { disabled }, submitLabel)),
    Notice: ({ message, onRetry }: { message: string; onRetry?: () => void }) => createElement("div", null, createElement("p", null, message), onRetry ? createElement("button", { onClick: onRetry }, "Retry") : null),
  };
});
const granted = { granted: true, canAskAgain: true, status: "granted" };
const undetermined = { granted: false, canAskAgain: true, status: "undetermined" };
let root: ReturnType<typeof createRoot> | undefined; let container: HTMLDivElement;
const buttons = () => [...container.querySelectorAll("button")].map((button) => button.textContent);
const find = (text: string) => [...container.querySelectorAll("button")].find((button) => button.textContent === text)!;
async function render() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container); await act(async () => root!.render(createElement(DevicePermissionSettings))); }
beforeEach(() => { vi.stubEnv("EXPO_OS", "android"); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.clearAllMocks(); mocks.listeners.length = 0; vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("a failing notification read leaves the camera usable, exposes Retry, and never requests a permission on mount", async () => {
  mocks.read.mockImplementation(async (kind: string) => { if (kind === "notifications") throw new Error("unavailable"); return undetermined; });
  await render();
  expect(buttons()).toContain("Camera: Permission required"); expect(buttons()).toContain("Notifications: Could not check");
  expect(find("Camera: Permission required").disabled).toBe(false); expect(find("Notifications: Could not check").disabled).toBe(true);
  expect(mocks.allow).not.toHaveBeenCalled(); expect(mocks.settings).not.toHaveBeenCalled();
  mocks.read.mockResolvedValue(granted);
  await act(async () => find("Retry").click());
  expect(buttons()).toContain("Notifications: Allowed"); expect(buttons()).not.toContain("Retry"); expect(mocks.allow).not.toHaveBeenCalled();
});
it("shows Checking only while a read is pending and refreshes again when the app returns to the foreground", async () => {
  let release!: (value: typeof granted) => void;
  mocks.read.mockImplementation((kind: string) => kind === "camera" ? new Promise((resolve) => { release = resolve as typeof release; }) : Promise.resolve(granted));
  await render(); expect(buttons()).toContain("Camera: Checking…"); expect(buttons()).toContain("Notifications: Allowed");
  await act(async () => release(granted)); expect(buttons()).toContain("Camera: Allowed");
  mocks.read.mockResolvedValue(undetermined); await act(async () => mocks.listeners.forEach((listener) => listener("active")));
  expect(buttons()).toContain("Camera: Permission required"); expect(mocks.allow).not.toHaveBeenCalled();
});
