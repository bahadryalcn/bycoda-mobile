// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { PushSection } from "./PushSection";
const fixture = vi.hoisted(() => ({
  runtime: {}, device: { id: "phone" } as { id: string } | null, available: true,
  permission: { granted: false, canAskAgain: false, status: "denied" },
  read: vi.fn(), enable: vi.fn(), reregister: vi.fn(), sync: vi.fn(), allow: vi.fn(), settings: vi.fn(async () => undefined),
  readError: null as Error | null,
  change: null as null | ((state: string) => void), remove: vi.fn(), press: null as null | (() => void),
}));
vi.mock("./account-context", () => ({ useAccount: () => ({ runtime: fixture.runtime, device: fixture.device, retryRegistration: fixture.reregister }) }));
vi.mock("../../permissions/device-permissions", () => ({ readDevicePermission: fixture.read, allowDevicePermission: fixture.allow }));
vi.mock("../model/push-account", () => ({ accountPushAvailable: () => fixture.available, enableAccountPush: fixture.enable, syncAccountPush: fixture.sync }));
vi.mock("react-native", () => ({ Linking: { openSettings: fixture.settings }, AppState: { addEventListener: (_event: string, change: (state: string) => void) => { fixture.change = change; return { remove: fixture.remove }; } } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("lucide-react-native/icons/bell-ring", () => ({ default: () => null }));
vi.mock("@/ui/primitives", () => ({
  Stack: ({ children }: PropsWithChildren) => createElement("div", null, children),
  NavigationGroup: ({ children }: PropsWithChildren) => createElement("div", null, children),
  SettingIcon: () => null,
  NavigationRow: ({ label, detail, onPress, disabled, intent, trailing }: { label: string; detail?: string; onPress: () => void; disabled?: boolean; intent?: string; trailing?: unknown }) => { if (intent === "command") fixture.press = onPress; return createElement("button", { onClick: onPress, disabled, title: detail }, label, trailing as never); },
  StatusText: ({ label }: { label: string }) => createElement("span", { "data-status": "" }, label),
  Notice: ({ message }: { message: string }) => createElement("p", null, message),
  Button: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => { fixture.press = onPress; return createElement("button", { onClick: onPress, disabled }, label); },
}));
let root: ReturnType<typeof createRoot> | undefined, node: HTMLDivElement;
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.read.mockImplementation(async () => { if (fixture.readError) throw fixture.readError; return fixture.permission; });
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
  await act(async () => root!.render(createElement(PushSection)));
}
afterEach(async () => {
  await act(async () => root?.unmount()); root = undefined; node?.remove();
  fixture.permission = { granted: false, canAskAgain: false, status: "denied" }; fixture.change = null; fixture.press = null; fixture.readError = null;
  fixture.device = { id: "phone" }; fixture.available = true;
  vi.clearAllMocks(); vi.unstubAllGlobals();
});
const labels = () => [...node.querySelectorAll("button")].map((button) => button.firstChild?.textContent);
const status = () => node.querySelector("[data-status]")?.textContent;
const detail = () => node.querySelector("button")?.getAttribute("title");
it("asks only for the OS permission when this phone has no account registration", async () => {
  fixture.device = null; fixture.permission = { granted: false, canAskAgain: true, status: "undetermined" };
  await mount();
  expect(labels()).toEqual(["Notifications"]); expect(status()).toBe("Off");
  fixture.allow.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
  await act(async () => fixture.press!());
  expect(fixture.allow).toHaveBeenCalledOnce(); expect(fixture.enable).not.toHaveBeenCalled();
  expect(status()).toBe("On");
});
it("names blocked recovery as system settings and rereads permission after return without requesting again", async () => {
  await mount(); expect(labels()).toEqual(["Notifications"]); expect(status()).toBe("Off in phone settings");
  expect(detail()).toBe("Open phone settings to turn them on.");
  await act(async () => fixture.press!()); expect(fixture.settings).toHaveBeenCalledOnce();
  fixture.permission = { granted: true, canAskAgain: false, status: "granted" };
  await act(async () => fixture.change?.("active"));
  expect(fixture.read).toHaveBeenCalledTimes(2); expect(fixture.sync).toHaveBeenCalledOnce();
  expect(status()).toBe("On"); expect(fixture.enable).not.toHaveBeenCalled();
});
it("keeps the known state on screen while a foreground re-read runs", async () => {
  fixture.permission = { granted: true, canAskAgain: false, status: "granted" }; await mount();
  let finish!: () => void;
  fixture.sync.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
  await act(async () => fixture.change?.("active"));
  expect(status()).toBe("On"); expect(detail()).not.toBe("Checking…");
  await act(async () => finish());
  expect(status()).toBe("On");
});
it("prevents two retained button callbacks from starting duplicate permission requests", async () => {
  fixture.permission = { granted: false, canAskAgain: true, status: "undetermined" }; await mount();
  let complete!: (allowed: boolean) => void;
  fixture.enable.mockReturnValue(new Promise<boolean>(resolve => { complete = resolve; }));
  const press = fixture.press!; await act(async () => { press(); press(); });
  expect(fixture.enable).toHaveBeenCalledOnce();
  await act(async () => complete(true));
});
it("retires pending completion and retained actions after the account changes", async () => {
  fixture.permission = { granted: false, canAskAgain: true, status: "undetermined" }; await mount();
  let complete!: (allowed: boolean) => void;
  fixture.enable.mockReturnValue(new Promise<boolean>(resolve => { complete = resolve; }));
  const oldPress = fixture.press!; await act(async () => oldPress());
  fixture.runtime = {}; await act(async () => root!.render(createElement(PushSection)));
  await act(async () => { complete(true); oldPress(); });
  expect(labels()).toEqual(["Notifications"]); expect(status()).toBe("Off");
  expect(fixture.enable).toHaveBeenCalledOnce(); expect(fixture.remove).toHaveBeenCalledOnce();
});
it("ends a failed or expired permission read in a visible state with Refresh, never requesting access", async () => {
  fixture.readError = new Error("permission check timed out"); await mount();
  expect(status()).toBeUndefined(); expect(detail()).toBe("Notification permission could not be read. Tap to refresh.");
  fixture.readError = null; await act(async () => fixture.press!());
  expect(fixture.read).toHaveBeenCalledTimes(2); expect(fixture.enable).not.toHaveBeenCalled(); expect(fixture.allow).not.toHaveBeenCalled();
  expect(status()).toBe("Off in phone settings");
});
it("names why account notifications failed although the OS permission is on, and re-registers a lost device", async () => {
  const { AccountApiError } = await import("../contracts/errors");
  fixture.permission = { granted: true, canAskAgain: true, status: "granted" };
  fixture.sync.mockRejectedValueOnce(new AccountApiError(404, "not_found", "Device not found"));
  await mount();
  expect(labels()).toEqual(["Notifications"]);
  expect(detail()).toBe("This phone's account registration was not found. Retry to register it again.");
  await act(async () => fixture.press!());
  expect(fixture.reregister).toHaveBeenCalledOnce(); expect(fixture.enable).not.toHaveBeenCalled();
});
it("shows the token failure instead of a generic one", async () => {
  const { PushTokenError } = await import("../../push/push-token-error");
  fixture.permission = { granted: true, canAskAgain: true, status: "granted" };
  fixture.sync.mockRejectedValueOnce(new PushTokenError(new Error("SERVICE_NOT_AVAILABLE")));
  await mount();
  expect(detail()).toMatch(/did not give this phone a notification token/);
});
