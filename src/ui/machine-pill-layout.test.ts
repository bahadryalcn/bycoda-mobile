// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
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
vi.mock("./motion", () => ({ haptic: { select: vi.fn() } }));
vi.mock("./primitives", () => ({
  Body: ({ children }: PropsWithChildren) => createElement("span", null, children),
  Button: ({ label }: { label: string }) => createElement("button", null, label),
  RowIcon: () => null,
  NavigationGroup: ({ children }: PropsWithChildren) => children,
  NavigationRow: ({ label, detail, metadata, accessibilityLabel }: { label: string; detail?: string; metadata?: string; accessibilityLabel?: string }) =>
    createElement("button", { "aria-label": accessibilityLabel }, [label, detail, metadata].filter(Boolean).join(" ")),
  Sheet: ({ visible, footer, children }: PropsWithChildren<{ visible: boolean; footer?: PropsWithChildren["children"] }>) =>
    visible ? createElement("section", null, children, createElement("footer", null, footer)) : null,
}));
vi.mock("./busy-indicator", () => ({
  BusyIndicator: () => null,
  LifecycleButton: ({ children, accessibilityLabel, onPress }: PropsWithChildren<{ accessibilityLabel?: string; onPress?: () => void }>) =>
    createElement("button", { "aria-label": accessibilityLabel, onClick: onPress }, children),
}));
vi.mock("expo-router", () => ({ router: {} }));
vi.mock("lucide-react-native/icons/settings-2", () => ({ default: () => null }));
vi.mock("../features/connections/connection-feedback", () => ({ ConnectionFeedback: () => null }));
vi.mock("../features/connections/active-computer-status", () => ({ RetryConnectionRow: () => null }));
vi.mock("../features/connections/storage-error-copy", () => ({ storageErrorText: (error: string | null) => error ?? undefined }));
vi.mock("../features/connections/use-switch-computer", () => ({ useSwitchComputer: () => ({ operation: {}, busy: false, switchTo: async () => undefined }) }));
vi.mock("panelui-native/components/menu", async () => {
  const { createContext, useContext } = await import("react");
  const context = createContext({ open: false, onOpenChange: (_open: boolean) => {} });
  return {
    Menu: Object.assign(
      ({ children, ...value }: PropsWithChildren<{ open: boolean; onOpenChange: (open: boolean) => void }>) =>
        createElement(context.Provider, { value }, children),
      {
        Trigger: ({ children }: PropsWithChildren) => {
          const { onOpenChange } = useContext(context);
          return createElement("div", { onClick: () => onOpenChange(true) }, children);
        },
        Content: ({ children }: PropsWithChildren) => useContext(context).open ? children : null,
        Item: ({ children, accessibilityLabel }: PropsWithChildren<{ accessibilityLabel?: string }>) =>
          createElement("button", { "aria-label": accessibilityLabel }, children),
      },
    ),
  };
});
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
  useMachines: (select: (value: unknown) => unknown) => select({ refreshDescriptor: () => {}, machines: [
    { id: "other", name: LONG_NAME, endpoint: "http://host:32000" },
    { id: "computer", name: LONG_NAME, endpoint: "http://host:31000" },
  ] }),
}));
vi.mock("../state/security", () => ({ useSecurity: (select: (value: unknown) => unknown) => select({ status: "unlocked" }) }));
vi.mock("../state/queries", () => ({
  useHostClient: () => ({}),
  useConsentPending: () => false,
  useHostConsentGranted: () => true,
  useHostQuery: () => ({ errorUpdatedAt: state.errorAt, error: undefined, isSuccess: false }),
}));
import { MachinePill } from "./machine-bar";

beforeEach(() => {
  Object.assign(state, { online: true, errorAt: 0, successAt: 99_000 });
  vi.spyOn(Date, "now").mockReturnValue(100_000);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const render = () => renderToStaticMarkup(createElement(MachinePill));

it("keeps the status in its own bounded text beside a shrinking computer name", () => {
  state.errorAt = 99_500;
  const html = render();
  // Both yield (ellipsis): the status is capped, so neither a long name nor a long status hides the other.
  expect(html).toContain(`data-lines="1" data-shrink="1">${LONG_NAME}</span>`);
  expect(html).toMatch(/data-lines="1" data-shrink="1" data-color="d">Disconnected<\/span>/);
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

it.each(["android", "web"])("keeps both same-name addresses visible and accessible in the %s picker", async platform => {
  vi.stubEnv("EXPO_OS", platform);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(MachinePill)));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label$="Choose computer"]')!.click());
    const active = container.querySelector(`button[aria-label="${LONG_NAME}. http://host:31000. Connected. Selected"]`);
    const other = container.querySelector(`button[aria-label="${LONG_NAME}. http://host:32000. Switch to this computer"]`);
    expect(active?.textContent).toContain("http://host:31000");
    expect(active?.textContent).toContain("Connected");
    expect(other?.textContent).toContain("http://host:32000");
    expect(active!.compareDocumentPosition(other!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    if (platform === "android") {
      expect(container.querySelector("footer")?.textContent).toContain("Manage computers");
    } else {
      const manage = container.querySelector('button[aria-label="Manage computers"]')!;
      expect(manage.compareDocumentPosition(active!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  } finally {
    await act(async () => root.unmount());
  }
});
