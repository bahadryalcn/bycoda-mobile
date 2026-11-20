// @vitest-environment happy-dom
import { act, createElement, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  rows: [] as any[], issues: [] as string[], platforms: [] as any[], hideHeader: false, fetching: false,
  refresh: undefined as undefined | (() => Promise<unknown>), listRead: vi.fn(), statusRead: vi.fn(),
  machineId: "computer", projectId: "project", endpoint: "https://synthetic.invalid", viewerUpdate: undefined as undefined | ((device: any) => void),
  intervals: {} as Record<string, number | undefined>,
}));
vi.mock("@/ui/state-view", () => ({ StateView: ({ title, description, action, secondaryAction }: any) => createElement("div", null, title, description, ...[action, secondaryAction].filter(Boolean).map((item: any) => createElement("button", { key: item.label, onClick: item.onPress }, item.label))) }));
vi.mock("@/ui/toast", () => ({ showToast: () => undefined, useToastAvailable: () => false, useSuccessToast: () => () => undefined }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/ui/duotone-icon", () => ({ Server: () => null, Smartphone: () => null }));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null }, router: { push: vi.fn() } }));
vi.mock("lucide-react-native/icons/smartphone", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));vi.mock("lucide-react-native/icons/wrench", () => ({ default: () => null }));

vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/tokens", () => ({ colors: {} }));
vi.mock("@/ui/typography", () => ({ Body: ({ children }: PropsWithChildren) => createElement("span", null, children) }));
vi.mock("@/state/connection-scope", () => ({ useConnectionScope: () => ({ isCurrent: () => true }) }));
vi.mock("@/ui/private-content", () => ({
  usePrivateContentAccess: () => ({ allowed: true, check: () => true }),
  PrivateContentAccessProvider: ({ children }: PropsWithChildren) => children,
}));
vi.mock("expo-crypto", () => { let id = 0; return { randomUUID: () => String(++id) }; });
vi.mock("@/state/machines", () => {
  const machine = () => ({ id: fixture.machineId, name: "Computer", endpoint: fixture.endpoint });
  return { useActiveMachine: machine, useMachines: { getState: () => ({ activeId: fixture.machineId, machines: [machine()] }), subscribe: () => () => {} } };
});
vi.mock("@/state/queries", () => ({ useHostQuery: (_key: unknown, method: string, _params: unknown, options: { interval?: number | ((data: { devices: unknown[] }) => number | false) } = {}) => {
  const interval = typeof options.interval === "function" ? options.interval({ devices: fixture.rows }) : options.interval;
  fixture.intervals[method] = interval === false ? undefined : interval;
  return {
    data: method === "devices.list" ? { devices: fixture.rows, errors: fixture.issues } : { platforms: fixture.platforms, agentInstalled: false },
    isSuccess: true, isFetching: method === "devices.list" && fixture.fetching,
    refetch: method === "devices.list" ? fixture.listRead : fixture.statusRead,
  };
} }));
vi.mock("@/ui/feedback", () => ({
  Empty: ({ title, action }: any) => createElement("div", null, title, action ? createElement("button", { onClick: action.onPress }, action.label) : null),
  ErrorNotice: () => null, Notice: () => null, Loading: () => null, Skeleton: () => null,
}));
vi.mock("@/ui/issue-summary", () => ({ IssueSummary: ({ issues, onRetry, details }: any) => issues.length
  ? createElement("div", null, issues.length > 1 ? createElement("details", null, details ?? issues.join(";")) : issues.join(";"), createElement("button", { onClick: onRetry }, "Retry device list")) : null }));
function Panel({ kind, canControl, deviceId, onClose }: { kind: string; canControl?: boolean; deviceId?: string; onClose?: () => void }) {
  const [draft, setDraft] = useState("");
  return createElement("aside", { "data-panel": kind, "data-control": String(canControl), "data-device": deviceId },
    createElement("input", { "aria-label": `${kind} draft`, value: draft, onChange: (e: any) => setDraft(e.target.value) }),
    createElement("button", { onClick: onClose }, `Close ${kind}`));
}
vi.mock("./device-viewer", () => ({ DeviceViewer: ({ canControl, onDevice, onClose, device }: any) => {
  fixture.viewerUpdate = onDevice; return createElement(Panel, { kind: "viewer", canControl, deviceId: device.id, onClose });
} }));
vi.mock("./device-runtime", () => ({ DeviceRuntime: ({ onClose }: any) => createElement(Panel, { kind: "runtime", onClose }) }));
vi.mock("@/ui/primitives", async () => {
  const { QueryState } = await import("@/ui/query-state");
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { QueryState, Sheet: Group, Body: Group, Disclosure: ({ label, children }: any) => createElement("details", null, createElement("summary", null, label), children), StatusText: () => null,
    Row: Group, Badge: ({ label }: any) => createElement("span", null, label),
    IconButton: ({label,onPress,disabled}:any) => createElement("button",{onClick:onPress,disabled},label),
    ActionMenu: ({actions}:any) => createElement("div",null,actions.map((action:any)=>createElement("button",{key:action.key,onClick:action.onPress},action.label))),
    NavigationRow: ({ label, onPress }: any) => createElement("button", { onClick: onPress }, label),
    SearchField: ({ label, value, onChangeText }: any) => createElement("input", { "aria-label": label, value, onChange: (e: any) => onChangeText(e.target.value) }),
    ScreenList: ({ header, data, renderItem, refresh, refreshState, actions }: any) => { fixture.refresh = refresh ?? refreshState?.onRefresh; return createElement("main", null,
      fixture.hideHeader ? null : createElement("header", null, actions, header), createElement("section", null, data.map((item: any) => createElement("div", { key: item.id }, renderItem({ item }))))); },
  };
});
import { DevicesScreen } from "./devices-screen";
import { SessionDeviceSheet } from "../workspace/session-device-sheet";
let root: ReturnType<typeof createRoot>, node: HTMLDivElement;
const render = () => act(() => root.render(createElement(DevicesScreen, { project: { id: fixture.projectId, name: "Project", cwd: "/project" } as any })));
const click = async (label: string) => { const button = [...node.querySelectorAll("button")].find((b) => b.textContent === label); expect(button).toBeTruthy(); await act(() => button!.click()); };
const input = async (label: string, value: string) => { const field = node.querySelector(`input[aria-label="${label}"]`)!;
  await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); }); };
beforeEach(() => {
  vi.clearAllMocks(); fixture.rows = [{ id: "phone", name: "Phone", platform: "android", version: "16", booted: true }];
  fixture.issues = []; fixture.platforms = []; fixture.fetching = false; fixture.hideHeader = false;
  fixture.machineId = "computer"; fixture.projectId = "project"; fixture.viewerUpdate = undefined; fixture.intervals = {};
  fixture.endpoint = "https://synthetic.invalid";
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
});
it("drops overlays on scope change and refuses a late result from the previous selection", async () => {
  await render(); await click("Phone"); const staleUpdate = fixture.viewerUpdate!;
  fixture.machineId = "another-computer"; await render(); expect(node.querySelector("aside")).toBeNull();
  fixture.rows = [{ ...fixture.rows[0], id: "new-phone", name: "Other phone" }]; await render(); await click("Other phone");
  act(() => staleUpdate({ id: "old-result", name: "Old device" })); expect(node.querySelector("aside")?.dataset.device).toBe("new-phone");
  fixture.endpoint = "https://repaired.synthetic.invalid"; await render(); expect(node.querySelector("aside")).toBeNull();
  fixture.endpoint = "https://synthetic.invalid"; await render(); expect(node.querySelector("aside")).toBeNull();
  fixture.machineId = "computer"; await render(); expect(node.querySelector("aside")).toBeNull();
  await click("Device service"); fixture.projectId = "other-project"; await render(); expect(node.querySelector("aside")).toBeNull();
  fixture.projectId = "project"; await render(); expect(node.querySelector("aside")).toBeNull();
});
afterEach(() => { act(() => root.unmount()); node.remove(); });
it("shows an empty session device picker and stops its list poll in the live viewer", async () => {
  const renderSheet = (deviceId?: string) => act(() => root.render(createElement(SessionDeviceSheet, {
    projectId: fixture.projectId, deviceId, onClose: vi.fn(),
  })));
  fixture.rows[0].booted = false;
  await renderSheet();
  expect(node.textContent).toContain("No device is running");
  expect(fixture.intervals["devices.list"]).toBe(15_000);
  fixture.rows[0].booted = true;
  await renderSheet("phone");
  expect(node.querySelector("aside")?.dataset.device).toBe("phone");
  expect(fixture.intervals["devices.list"]).toBeUndefined();
  await renderSheet();
  expect(fixture.intervals["devices.list"]).toBe(15_000);
  await click("Phone");
  expect(fixture.intervals["devices.list"]).toBeUndefined();
});
it("keeps partial failures distinct from an empty success and retries only the failed collection", async () => {
  fixture.rows = []; fixture.issues = ["Android discovery failed"]; fixture.platforms = [{ platform: "ios", available: false, reason: "Requires macOS" }, { platform: "android", available: false }]; await render();
  expect(node.textContent).not.toContain("No devices found."); expect(node.textContent).toContain("Android discovery failed");
  expect(node.querySelector("details")?.textContent).toContain("Requires macOS"); expect(node.querySelector("details")?.textContent).toContain("Unavailable");
  expect(node.querySelectorAll("details")).toHaveLength(1);
  await click("Retry device list"); expect(fixture.listRead).toHaveBeenCalledOnce(); expect(fixture.statusRead).not.toHaveBeenCalled();
  fixture.fetching = true; await render(); await click("Retry device list"); expect(fixture.listRead).toHaveBeenCalledOnce();
});
it("clears a no-match filter, trims matching whitespace, and keeps a successful empty state distinct", async () => {
  await render(); await input("Search devices", " android "); expect(node.textContent).toContain("Phone");
  await input("Search devices", "missing"); expect(node.textContent).toContain("No matching results"); await click("Clear search"); expect(node.textContent).toContain("Phone");
  fixture.rows = []; fixture.issues = [" "]; await render(); expect(node.textContent).toContain("No devices found.");
});
it("uses one refresh callback for status and list reads", async () => {
  await render(); await fixture.refresh!(); expect(fixture.listRead).toHaveBeenCalledOnce(); expect(fixture.statusRead).toHaveBeenCalledOnce();
});

it("keeps expected platform limits as quiet details without a failure retry", async () => {
  fixture.platforms = [{ platform: "ios", available: false, reason: "Requires macOS" }]; await render();
  expect(node.querySelectorAll("details")).toHaveLength(1);
  expect(node.querySelector("details")?.textContent).toContain("Requires macOS");
  expect([...node.querySelectorAll("button")].some(button => button.textContent === "Retry device list")).toBe(false);
});

it("shares the refresh flight between toolbar and pull requests", async () => {
  let finish!: () => void;
  fixture.listRead.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
  await render(); let flight!: Promise<unknown>;
  await act(async () => { flight = fixture.refresh!(); void fixture.refresh!(); });
  expect(fixture.listRead).toHaveBeenCalledOnce(); expect(fixture.statusRead).toHaveBeenCalledOnce();
  await act(async () => { finish(); await flight; });
});
it("pauses listing polls while a device or the device service is open and refetches once on return", async () => {
  await render(); expect(fixture.intervals).toEqual({ "devices.status": 15_000, "devices.list": 15_000 });
  await click("Phone"); expect(fixture.intervals).toEqual({ "devices.status": undefined, "devices.list": undefined });
  await click("Close viewer"); expect(fixture.intervals).toEqual({ "devices.status": 15_000, "devices.list": 15_000 });
  expect(fixture.listRead).toHaveBeenCalledOnce(); expect(fixture.statusRead).toHaveBeenCalledOnce();
  await click("Device service"); expect(fixture.intervals).toEqual({ "devices.status": undefined, "devices.list": undefined });
  await click("Close runtime"); expect(fixture.intervals).toEqual({ "devices.status": 15_000, "devices.list": 15_000 });
  expect(fixture.listRead).toHaveBeenCalledTimes(2); expect(fixture.statusRead).toHaveBeenCalledTimes(2);
});

it("describes an empty listing accurately for no devices, no available platform and a filter", async () => {
  fixture.rows = []; await render();
  expect(node.textContent).toContain("No devices found."); expect(node.textContent).toContain("Start a simulator or connect a device on this computer, then refresh.");
  fixture.platforms = [{ platform: "ios", available: false, reason: "Requires macOS" }, { platform: "android", available: false }]; await render();
  expect(node.textContent).toContain("Devices can't be listed on this computer."); expect(node.textContent).not.toContain("No devices found.");
  expect(node.textContent).not.toContain("Start a simulator");
  fixture.platforms = [{ platform: "android", available: true }]; fixture.rows = [{ id: "phone", name: "Phone", platform: "android", version: "16", booted: true }];
  await render(); await input("Search devices", "missing"); expect(node.textContent).toContain("No matching results");
  expect(node.textContent).not.toContain("Start a simulator");
});

it.each(["viewer", "runtime"])("keeps the %s owner and local state when the virtualized header disappears", async (kind) => {
  await render(); await click(kind === "viewer" ? "Phone" : "Device service"); await input(`${kind} draft`, "Retained panel state");
  fixture.hideHeader = true; await render(); expect((node.querySelector(`input[aria-label="${kind} draft"]`) as HTMLInputElement).value).toBe("Retained panel state");
  if (kind === "viewer") expect(node.querySelector("aside")?.dataset.control).toBe("false");
});
