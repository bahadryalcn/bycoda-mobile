import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ paired: true, online: true, permitted: true, consented: false, consentPending: false, successAt: 99_000, errorAt: 0, error: undefined as unknown }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: { success: { text: "s" }, info: { text: "i" }, warning: { text: "w" }, danger: { text: "d" } }, uiStyles: {} }) }));
vi.mock("./styles", () => ({ uiStyles: {} }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./motion", () => ({ haptic: {} }));
vi.mock("./primitives", () => ({ Body: ({ children }: PropsWithChildren) => createElement("span", null, children), NavigationGroup: () => null, NavigationRow: () => null, Sheet: () => null }));
vi.mock("./busy-indicator", () => ({ BusyIndicator: () => null }));
vi.mock("expo-router", () => ({ router: {} }));
vi.mock("lucide-react-native/icons/settings-2", () => ({ default: () => null }));
vi.mock("../features/connections/connection-feedback", () => ({ ConnectionFeedback: () => null }));
vi.mock("../features/connections/active-computer-status", () => ({ RetryConnectionRow: () => null }));
vi.mock("../features/connections/storage-error-copy", () => ({ storageErrorText: (error: string | null) => error ?? undefined }));
vi.mock("../features/connections/use-switch-computer", () => ({ useSwitchComputer: () => ({ operation: {}, busy: false, switchTo: async () => undefined }) }));
vi.mock("panelui-native/components/menu", () => ({ Menu: {} }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children), Text: "span", Pressable: "button" }));
vi.mock("lucide-react-native/icons/chevron-right", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevron-down", () => ({ default: () => null }));
vi.mock("./icon-tile", () => ({ IconTile: () => null }));
vi.mock("lucide-react-native/icons/hard-drive", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/laptop", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/wifi-off", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/circle-alert", () => ({ default: () => null }));
vi.mock("@react-native-community/netinfo", () => ({ useNetInfo: () => ({ isConnected: state.online }) }));
vi.mock("@tanstack/react-query", () => ({
  notifyManager: { batchCalls: (callback: unknown) => callback },
  useQueryClient: () => ({ getQueryCache: () => ({ subscribe: () => () => {}, findAll: () => [{ state: { dataUpdatedAt: state.successAt } }] }) }),
}));
vi.mock("../state/machines", () => ({
  useActiveMachine: () => state.paired ? { id: "computer", capabilities: ["transport.ws.v2"] } : null,
  useMachines: (select: (value: unknown) => unknown) => select({ refreshDescriptor: () => {} }),
}));
vi.mock("../state/security", () => ({ useSecurity: (select: (value: unknown) => unknown) => select({ status: "unlocked" }) }));
vi.mock("../state/queries", () => ({
  useHostClient: () => state.permitted ? {} : undefined,
  useConsentPending: () => state.consentPending,
  useHostConsentGranted: () => state.consented,
  useHostQuery: () => ({ errorUpdatedAt: state.errorAt, error: state.error, isSuccess: false }),
}));
import { CONNECTION_BLIP_GRACE_MS } from "./connection-presentation";

// machine-bar keeps per-computer blip memory at module level; each test loads a fresh copy so a
// connection proven in one test is never held "connected" through the grace in the next.
let MachineConnectionStatus: typeof import("./machine-bar").MachineConnectionStatus;
let RemoteHostError: typeof import("../remote/host-error").RemoteHostError;
let recordHostRuntimeStartupFailed: typeof import("../state/host-runtime-state").recordHostRuntimeStartupFailed;

beforeEach(async () => {
  vi.resetModules();
  ({ MachineConnectionStatus } = await import("./machine-bar"));
  ({ RemoteHostError } = await import("../remote/host-error"));
  ({ recordHostRuntimeStartupFailed } = await import("../state/host-runtime-state"));
  Object.assign(state, { paired: true, online: true, permitted: true, consented: false, consentPending: false, successAt: 99_000, errorAt: 0, error: undefined });
  vi.spyOn(Date, "now").mockReturnValue(100_000);
});
afterEach(() => {
  recordHostRuntimeStartupFailed(false);
  vi.restoreAllMocks();
});
const render = () => renderToStaticMarkup(createElement(MachineConnectionStatus));
it("uses no visual space for a healthy connection and removes the warning after recovery", () => {
  expect(render()).toBe("");
  state.errorAt = 99_500;
  // A failure right after a proven connection is a blip: it stays quiet through the grace.
  expect(render()).toBe("");
  vi.spyOn(Date, "now").mockReturnValue(100_000 + CONNECTION_BLIP_GRACE_MS);
  expect(render()).toContain("Disconnected");
  state.successAt = 99_900;
  expect(render()).toBe("");
});
it("shows an offline or permission failure despite cached successful traffic", () => {
  state.online = false;
  expect(render()).toContain("No network connection");
  state.online = true;
  state.permitted = false;
  expect(render()).toContain("Permission required");
});
it("reports startup failure for an authorized computer even before a client exists", () => {
  Object.assign(state, { permitted: false, consented: true, successAt: 0 });
  expect(render()).toContain("Checking connection");
  recordHostRuntimeStartupFailed(true);
  expect(render()).toContain("Connection couldn’t start");
  state.consented = false;
  expect(render()).toContain("Permission required");
});
it("names a refused device key as access and does not claim missing permission while consent loads", () => {
  state.errorAt = 99_500;
  state.error = new RemoteHostError("computer", "auth", "denied");
  expect(render()).toContain("Access needed");
  Object.assign(state, { errorAt: 0, error: undefined, permitted: false, consentPending: true, successAt: 0 });
  expect(render()).toContain("Checking connection");
  expect(render()).not.toContain("Permission required");
});
it("keeps unknown and unpaired states distinct from a proven connection", () => {
  state.successAt = 0;
  expect(render()).toContain("Checking connection");
  state.paired = false;
  expect(render()).toContain("Connect a computer");
});
