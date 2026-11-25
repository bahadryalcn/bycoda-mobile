// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { PushSection } from "./PushSection";
const fixture = vi.hoisted(() => ({
  runtime: {}, device: { id: "phone" } as { id: string } | null, available: true,
  permission: { granted: false, canAskAgain: false, status: "denied" },
  read: vi.fn(), enable: vi.fn(), sync: vi.fn(), allow: vi.fn(), settings: vi.fn(async () => undefined),
  readError: null as Error | null,
  change: null as null | ((state: string) => void), remove: vi.fn(), press: null as null | (() => void),
}));
vi.mock("./account-context", () => ({ useAccount: () => ({ runtime: fixture.runtime, device: fixture.device }) }));
vi.mock("../../permissions/device-permissions", () => ({ readDevicePermission: fixture.read, allowDevicePermission: fixture.allow }));
vi.mock("../model/push-account", () => ({ accountPushAvailable: () => fixture.available, enableAccountPush: fixture.enable, syncAccountPush: fixture.sync }));
vi.mock("react-native", () => ({ Linking: { openSettings: fixture.settings }, AppState: { addEventListener: (_event: string, change: (state: string) => void) => { fixture.change = change; return { remove: fixture.remove }; } } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("lucide-react-native/icons/bell-ring", () => ({ default: () => null }));
vi.mock("@/ui/primitives", () => ({
  Stack: ({ children }: PropsWithChildren) => createElement("div", null, children),
  NavigationGroup: ({ children }: PropsWithChildren) => createElement("div", null, children),
  SettingIcon: () => null,
  NavigationRow: ({ label, detail, onPress, disabled, intent }: { label: string; detail?: string; onPress: () => void; disabled?: boolean; intent?: string }) => { if (intent === "command") fixture.press = onPress; return createElement("button", { onClick: onPress, disabled, title: detail }, label); },
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
const labels = () => [...node.querySelectorAll("button")].map((button) => button.textContent);
const detail = () => node.querySelector("button")?.getAttribute("title");
it("asks only for the OS permission when this phone has no account registration", async () => {
  fixture.device = null; fixture.permission = { granted: false, canAskAgain: true, status: "undetermined" };
  await mount();
  expect(labels()).toEqual(["Turn on notifications on this phone"]);
  fixture.allow.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
  await act(async () => fixture.press!());
  expect(fixture.allow).toHaveBeenCalledOnce(); expect(fixture.enable).not.toHaveBeenCalled();
  expect(detail()).toBe("On");
});
it("names blocked recovery as system settings and rereads permission after return without requesting again", async () => {
  await mount(); expect(labels()).toEqual(["Open phone settings"]); expect(detail()).toBe("Turned off in phone settings.");
  await act(async () => fixture.press!()); expect(fixture.settings).toHaveBeenCalledOnce();
  fixture.permission = { granted: true, canAskAgain: false, status: "granted" };
  await act(async () => fixture.change?.("active"));
  expect(fixture.read).toHaveBeenCalledTimes(2); expect(fixture.sync).toHaveBeenCalledOnce();
  expect(detail()).toBe("On. Use phone settings to turn them off."); expect(fixture.enable).not.toHaveBeenCalled();
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
  expect(labels()).toEqual(["Turn on notifications on this phone"]);
  expect(fixture.enable).toHaveBeenCalledOnce(); expect(fixture.remove).toHaveBeenCalledOnce();
});
it("ends a failed or expired permission read in a visible state with Refresh, never requesting access", async () => {
  fixture.readError = new Error("permission check timed out"); await mount();
  expect(labels()).toEqual(["Refresh"]); expect(detail()).toBe("Notification permission could not be read.");
  fixture.readError = null; await act(async () => fixture.press!());
  expect(fixture.read).toHaveBeenCalledTimes(2); expect(fixture.enable).not.toHaveBeenCalled(); expect(fixture.allow).not.toHaveBeenCalled();
  expect(labels()).toEqual(["Open phone settings"]);
});
