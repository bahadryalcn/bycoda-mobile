import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const LONG_NAME = "A-very-long-workstation-name-that-cannot-fit-in-a-narrow-pill";
const state = vi.hoisted(() => ({ online: true, errorAt: 0, successAt: 99_000 }));
type StyleValue = Record<string, unknown> | StyleValue[] | undefined;
const flatten = (style: StyleValue): Record<string, unknown> =>
  Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : { ...style };

vi.mock("./theme", () => ({
  useMobileTheme: () => ({
    mode: "dark",
    colors: {},
    pressedFill: "p",
    semanticColors: { success: { text: "s" }, info: { text: "i" }, warning: { text: "w" }, danger: { text: "d" } },
    uiStyles: {},
  }),
}));
vi.mock("./styles", () => ({ uiStyles: {} }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./motion", () => ({ haptic: {} }));
vi.mock("./primitives", () => ({ Body: ({ children }: PropsWithChildren) => createElement("span", null, children), NavigationGroup: () => null, NavigationRow: () => null, Sheet: () => null }));
vi.mock("./busy-indicator", () => ({
  BusyIndicator: () => null,
  LifecycleButton: ({ children, accessibilityLabel }: PropsWithChildren<{ accessibilityLabel?: string }>) =>
    createElement("button", { "aria-label": accessibilityLabel }, children),
}));
vi.mock("expo-router", () => ({ router: {} }));
vi.mock("lucide-react-native/icons/settings-2", () => ({ default: () => null }));
vi.mock("../features/connections/connection-feedback", () => ({ ConnectionFeedback: () => null }));
vi.mock("../features/connections/use-switch-computer", () => ({ useSwitchComputer: () => ({ operation: {}, busy: false, switchTo: async () => undefined }) }));
vi.mock("panelui-native/components/menu", () => ({ Menu: {} }));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
  // Serialises the layout props the regression asserts on; the real Text is native.
  Text: ({ children, numberOfLines, style }: PropsWithChildren<{ numberOfLines?: number; style?: StyleValue }>) =>
    createElement("span", { "data-lines": numberOfLines, "data-shrink": flatten(style).flexShrink, "data-color": flatten(style).color }, children),
  Pressable: "button",
}));
vi.mock("lucide-react-native/icons/chevron-right", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevron-down", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/hard-drive", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/laptop", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/wifi-off", () => ({ default: () => createElement("i", { "data-icon": "wifi-off" }) }));
vi.mock("lucide-react-native/icons/circle-alert", () => ({ default: () => createElement("i", { "data-icon": "circle-alert" }) }));
vi.mock("./icon-tile", () => ({ IconTile: () => null }));
vi.mock("@react-native-community/netinfo", () => ({ useNetInfo: () => ({ isConnected: state.online }) }));
vi.mock("@tanstack/react-query", () => ({
  notifyManager: { batchCalls: (callback: unknown) => callback },
  useQueryClient: () => ({ getQueryCache: () => ({ subscribe: () => () => {}, findAll: () => [{ state: { dataUpdatedAt: state.successAt } }] }) }),
}));
vi.mock("../state/machines", () => ({
  useActiveMachine: () => ({ id: "computer", name: LONG_NAME }),
  useMachines: (select: (value: unknown) => unknown) => select({ refreshDescriptor: () => {}, machines: [{ id: "computer", name: LONG_NAME, endpoint: "http://host" }] }),
}));
vi.mock("../state/security", () => ({ useSecurity: (select: (value: unknown) => unknown) => select({ status: "unlocked" }) }));
vi.mock("../state/queries", () => ({
  useHostClient: () => ({}),
  useConsentPending: () => false,
  useHostQuery: () => ({ errorUpdatedAt: state.errorAt, error: undefined, isSuccess: false }),
}));
import { MachinePill } from "./machine-bar";

beforeEach(() => {
  Object.assign(state, { online: true, errorAt: 0, successAt: 99_000 });
  vi.spyOn(Date, "now").mockReturnValue(100_000);
});
afterEach(() => vi.restoreAllMocks());
const render = () => renderToStaticMarkup(createElement(MachinePill));

it("keeps the status in its own non-shrinking text beside a shrinking computer name", () => {
  state.errorAt = 99_500;
  const html = render();
  // Name yields (ellipsis); status keeps its width so a long name cannot push it out.
  expect(html).toContain(`data-lines="1" data-shrink="1">${LONG_NAME}</span>`);
  expect(html).toMatch(/data-lines="1" data-shrink="0" data-color="d">Disconnected<\/span>/);
  expect(html).not.toContain(`${LONG_NAME} · `);
});

it("marks a degraded pill with an icon and keeps the full accessible label", () => {
  state.errorAt = 99_500;
  expect(render()).toContain('data-icon="wifi-off"');
  expect(render()).toContain(`aria-label="${LONG_NAME}. Disconnected. Choose computer"`);
  state.online = false;
  const offline = render();
  expect(offline).toContain("No network connection");
  expect(offline).toContain(`aria-label="${LONG_NAME}. No network connection. Choose computer"`);
});

it("shows only the name when the connection is healthy", () => {
  const html = render();
  expect(html).toContain(LONG_NAME);
  expect(html).not.toContain("Disconnected");
  expect(html).not.toContain("data-icon");
});
