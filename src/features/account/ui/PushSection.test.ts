// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { PushSection } from "./PushSection";
const fixture = vi.hoisted(() => ({
  runtime: {}, device: { id: "phone" } as { id: string } | null, available: true,
  permission: { granted: false, canAskAgain: false, status: "denied" },
  read: vi.fn(), enable: vi.fn(), sync: vi.fn(),
  readError: null as Error | null,
  change: null as null | ((state: string) => void), remove: vi.fn(), press: null as null | (() => void),
}));
vi.mock("./account-context", () => ({ useAccount: () => ({ runtime: fixture.runtime, device: fixture.device }) }));
vi.mock("../../permissions/device-permissions", () => ({ readDevicePermission: fixture.read }));
vi.mock("../model/push-account", () => ({ accountPushAvailable: () => fixture.available, enableAccountPush: fixture.enable, syncAccountPush: fixture.sync }));
vi.mock("react-native", () => ({ AppState: { addEventListener: (_event: string, change: (state: string) => void) => { fixture.change = change; return { remove: fixture.remove }; } } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/info-hint", () => ({ HintSection: ({ children }: PropsWithChildren) => createElement("section", null, children) }));
vi.mock("expo-router", () => ({ router: { navigate: vi.fn() } }));
vi.mock("lucide-react-native/icons/bell-ring", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/sliders-horizontal", () => ({ default: () => null }));
vi.mock("@/ui/primitives", () => ({
  Stack: ({ children }: PropsWithChildren) => createElement("div", null, children),
  NavigationGroup: ({ children }: PropsWithChildren) => createElement("div", null, children),
  SettingIcon: () => null,
  NavigationRow: ({ label, onPress, disabled, intent }: { label: string; onPress: () => void; disabled?: boolean; intent?: string }) => { if (intent === "command") fixture.press = onPress; return createElement("button", { onClick: onPress, disabled }, label); },
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
it("keeps notification preferences reachable when phone registration is unavailable", async () => {
  fixture.device = null;
  await mount();
  expect([...node.querySelectorAll("button")].map(button => button.textContent)).toEqual(["Notification settings"]);
  expect(fixture.read).not.toHaveBeenCalled();
  expect(fixture.enable).not.toHaveBeenCalled();
});
it("keeps notification preferences reachable without push support", async () => {
  fixture.available = false;
  await mount();
  expect([...node.querySelectorAll("button")].map(button => button.textContent)).toEqual(["Notification settings"]);
  expect(fixture.read).not.toHaveBeenCalled();
});
it("names blocked recovery as system settings and rereads permission after return without requesting again", async () => {
  await mount(); expect(node.querySelector("button")?.textContent).toBe("Open phone settings");
  fixture.permission = { granted: true, canAskAgain: false, status: "granted" };
  await act(async () => fixture.change?.("active"));
  expect(fixture.read).toHaveBeenCalledTimes(2); expect(fixture.sync).toHaveBeenCalledOnce();
  expect([...node.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Notification settings"]); expect(fixture.enable).not.toHaveBeenCalled();
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
  await mount();
  let complete!: (allowed: boolean) => void;
  fixture.enable.mockReturnValue(new Promise<boolean>(resolve => { complete = resolve; }));
  const oldPress = fixture.press!; await act(async () => oldPress());
  fixture.runtime = {}; await act(async () => root!.render(createElement(PushSection)));
  await act(async () => { complete(true); oldPress(); });
  expect(node.querySelector("button")?.textContent).toBe("Open phone settings");
  expect(fixture.enable).toHaveBeenCalledOnce(); expect(fixture.remove).toHaveBeenCalledOnce();
});
it("retries a failed permission read without requesting notification access", async () => {
  fixture.readError = new Error("Permission service unavailable"); await mount();
  expect(node.textContent).toContain("Notification permission could not be read. Try again.");
  expect(node.querySelector("button")?.textContent).toBe("Refresh");
  fixture.readError = null; await act(async () => fixture.press!());
  expect(fixture.read).toHaveBeenCalledTimes(2); expect(fixture.enable).not.toHaveBeenCalled();
  expect(node.querySelector("button")?.textContent).toBe("Open phone settings");
});
