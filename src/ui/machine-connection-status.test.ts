import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ paired: true, online: true, permitted: true, successAt: 99_000, errorAt: 0 }));
vi.mock("./theme", () => ({ useMobileTheme: () => undefined }));
vi.mock("./styles", () => ({ uiStyles: {} }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./motion", () => ({ haptic: {} }));
vi.mock("./primitives", () => ({ Body: ({ children }: PropsWithChildren) => createElement("span", null, children) }));
vi.mock("./busy-indicator", () => ({ BusyIndicator: () => null }));
vi.mock("expo-router", () => ({ router: {} }));
vi.mock("panelui-native/components/menu", () => ({ Menu: {} }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children), Text: "span", Pressable: "button" }));
vi.mock("lucide-react-native/icons/chevron-right", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevron-down", () => ({ default: () => null }));
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
  useActiveMachine: () => state.paired ? { id: "computer" } : undefined,
  useMachines: (select: (value: unknown) => unknown) => select({ refreshDescriptor: () => {} }),
}));
vi.mock("../state/security", () => ({ useSecurity: (select: (value: unknown) => unknown) => select({ status: "unlocked" }) }));
vi.mock("../state/queries", () => ({
  useHostClient: () => state.permitted ? {} : undefined,
  useHostQuery: () => ({ errorUpdatedAt: state.errorAt, isSuccess: false }),
}));
import { MachineConnectionStatus } from "./machine-bar";

beforeEach(() => {
  Object.assign(state, { paired: true, online: true, permitted: true, successAt: 99_000, errorAt: 0 });
  vi.spyOn(Date, "now").mockReturnValue(100_000);
});
afterEach(() => vi.restoreAllMocks());
const render = () => renderToStaticMarkup(createElement(MachineConnectionStatus));
it("uses no visual space for a healthy connection and removes the warning after recovery", () => {
  expect(render()).toBe("");
  state.errorAt = 99_500;
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
it("keeps unknown and unpaired states distinct from a proven connection", () => {
  state.successAt = 0;
  expect(render()).toContain("Checking connection");
  state.paired = false;
  expect(render()).toContain("Connect a computer");
});
