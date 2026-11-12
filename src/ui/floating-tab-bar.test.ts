// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FloatingTabBar } from "./floating-tab-bar";
const state = vi.hoisted(() => ({
  keyboard: false,
  emit: vi.fn(() => ({ defaultPrevented: false })),
  navigate: vi.fn(),
  haptic: vi.fn(),
  reduceTransparency: false,
  canBlur: true,
}));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: () => null }));
vi.mock("expo-blur", () => ({
  BlurView: ({ children, tint, intensity, experimentalBlurMethod }: PropsWithChildren<{ tint: string; intensity: number; experimentalBlurMethod?: string }>) =>
    createElement("div", { "data-blur": tint, "data-intensity": intensity, "data-method": experimentalBlurMethod }, children),
}));
vi.mock("panelui-native/primitives/scrim", () => ({
  get canBlurHere() { return state.canBlur; },
  androidBlurProps: () => ({}),
}));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => createElement("i", { "data-icon": "plus" }) }));
vi.mock("./motion", () => ({ haptic: { select: state.haptic }, indicatorTiming: {} }));
vi.mock("./use-reduced-motion", () => ({ useReducedMotionPreference: () => true }));
vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({ children }: PropsWithChildren) => createElement("div", null, children),
    Text: ({ children }: PropsWithChildren) => createElement("span", { "data-label": "" }, children),
  },
  FadeIn: { duration: () => ({}) },
  LinearTransition: { duration: () => ({}) },
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0 }),
}));
vi.mock("react-native-keyboard-controller", () => ({
  useKeyboardState: (select: (s: { isVisible: boolean }) => unknown) =>
    select({ isVisible: state.keyboard }),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AccessibilityInfo: {
    isReduceTransparencyEnabled: () => Promise.resolve(state.reduceTransparency),
    addEventListener: () => ({ remove: () => {} }),
  },
  StyleSheet: { hairlineWidth: 1 },
  View: ({
    children,
    accessibilityRole,
    onLayout,
  }: PropsWithChildren<{ accessibilityRole?: string; onLayout?: (e: unknown) => void }>) =>
    createElement("div", { role: accessibilityRole, "data-layout": onLayout ? "" : undefined, onFocus: onLayout ? () => onLayout({ nativeEvent: { layout: { height: 92 } } }) : undefined }, children),
  Text: ({ children }: PropsWithChildren) =>
    createElement("span", null, children),
  Pressable: ({
    children,
    accessibilityLabel,
    accessibilityRole,
    onPress,
    onLongPress,
    disabled,
    "aria-selected": selected,
  }: PropsWithChildren<{
    accessibilityLabel: string;
    accessibilityRole: string;
    disabled?: boolean;
    onPress: () => void;
    onLongPress: () => void;
    "aria-selected": boolean;
  }>) =>
    createElement(
      "button",
      {
        role: accessibilityRole,
        "aria-label": accessibilityLabel,
        "aria-selected": selected,
        disabled,
        onClick: onPress,
        onContextMenu: onLongPress,
      },
      children,
    ),
}));
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
const routes = ["projects", "sessions", "inbox", "tools", "settings"].map(
  (name) => ({ name, key: name, params: { retained: name } }),
);
const props = {
  state: { index: 0, routes },
  descriptors: Object.fromEntries(
    routes.map((route) => [
      route.key,
      {
        options: {
          title: route.name,
          ...(route.name === "sessions" ? { tabBarBadge: "99+" } : {}),
        },
      },
    ]),
  ),
  emitter: { emit: state.emit },
  navigateToTab: state.navigate,
} as unknown as Parameters<typeof FloatingTabBar>[0];
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.keyboard = false;
  state.reduceTransparency = false;
  state.canBlur = true;
  state.emit.mockReturnValue({ defaultPrevented: false });
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function render(extra: Partial<Parameters<typeof FloatingTabBar>[0]> = {}) {
  await act(async () => root.render(createElement(FloatingTabBar, { ...props, ...extra })));
}
it("blurs the capsule behind the tabs unless reduce transparency is on", async () => {
  await render();
  const blur = container.querySelector("[data-blur]");
  expect(blur?.getAttribute("data-blur")).toBe("dark");
  expect(blur?.getAttribute("data-intensity")).toBe("50");
  expect(container.querySelector("[role=tablist]")?.querySelectorAll("[role=tab]")).toHaveLength(5);
  await act(async () => root.unmount());
  root = createRoot(container);
  state.reduceTransparency = true;
  await render();
  expect(container.querySelector("[data-blur]")).toBeNull();
  expect(container.querySelectorAll("[role=tab]")).toHaveLength(5);
  await act(async () => root.unmount());
  root = createRoot(container);
  state.reduceTransparency = false;
  state.canBlur = false;
  await render();
  expect(container.querySelector("[data-blur]")).toBeNull();
});
it("labels every tab, keeps every accessible name and never changes the tab row for the action", async () => {
  await render();
  const tabs = [...container.querySelectorAll("[role=tab]")];
  expect(tabs.map((tab) => tab.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("projects")]));
  for (const tab of tabs) expect(tab.textContent).not.toBe("");
  expect(tabs[1]!.getAttribute("aria-label")).toBe("sessions, 99+");
  await render({ action: { label: "New session", onPress: vi.fn() } });
  expect(container.querySelectorAll("[role=tab]")).toHaveLength(tabs.length);
});
it("renders the round action only when provided and honors press and disabled", async () => {
  await render();
  expect(container.querySelector("[aria-label='New session']")).toBeNull();
  const onPress = vi.fn();
  await render({ action: { label: "New session", onPress } });
  const button = container.querySelector("[aria-label='New session']") as HTMLButtonElement;
  expect(button.getAttribute("role")).toBe("button");
  expect(button.querySelector("[data-icon=plus]")).not.toBeNull();
  await act(async () => button.click());
  expect(onPress).toHaveBeenCalledOnce();
  expect(state.haptic).toHaveBeenCalledOnce();
  await render({ action: { label: "New session", onPress, disabled: true } });
  expect((container.querySelector("[aria-label='New session']") as HTMLButtonElement).disabled).toBe(true);
});
it("publishes the measured dock height and clears it when the dock hides", async () => {
  const onInsetChange = vi.fn();
  await render({ onInsetChange });
  const host = container.querySelector("[data-layout]") as HTMLElement;
  await act(async () => host.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
  expect(onInsetChange).toHaveBeenLastCalledWith(92);
  state.keyboard = true;
  await render({ onInsetChange });
  expect(onInsetChange).toHaveBeenLastCalledWith(0);
  await act(async () => root.unmount());
  expect(onInsetChange).toHaveBeenLastCalledWith(0);
  root = createRoot(container);
});
it("starts concealed when mounted while the keyboard is already open", async () => {
  state.keyboard = true;
  await render();
  expect(container.querySelector("[role=tablist]")).toBeNull();
  expect(state.navigate).not.toHaveBeenCalled();
});
it("retains selected state, count meaning, route params, reselection events and long press", async () => {
  await render();
  const tabs = container.querySelectorAll("[role=tab]");
  expect(tabs).toHaveLength(5);
  expect(tabs[0].getAttribute("aria-selected")).toBe("true");
  expect(tabs[1].getAttribute("aria-label")).toBe("sessions, 99+");
  await act(async () => (tabs[0] as HTMLElement).click());
  expect(state.emit).toHaveBeenLastCalledWith({
    type: "tabPress",
    target: "projects",
    canPreventDefault: true,
  });
  expect(state.navigate).not.toHaveBeenCalled();
  await act(async () => (tabs[1] as HTMLElement).click());
  expect(state.navigate).toHaveBeenCalledExactlyOnceWith("sessions");
  expect(state.haptic).toHaveBeenCalledOnce();
  await act(async () =>
    tabs[4].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })),
  );
  expect(state.emit).toHaveBeenLastCalledWith({
    type: "tabLongPress",
    target: "settings",
  });
});
it("honors prevented navigation and follows an already-open keyboard without changing the selected route", async () => {
  state.emit.mockReturnValue({ defaultPrevented: true });
  await render();
  await act(async () =>
    (container.querySelectorAll("[role=tab]")[2] as HTMLElement).click(),
  );
  expect(state.navigate).not.toHaveBeenCalled();
  expect(state.haptic).not.toHaveBeenCalled();
  state.keyboard = true;
  await render();
  expect(container.querySelector("[role=tablist]")).toBeNull();
  state.keyboard = false;
  await render();
  expect(container.querySelector('[aria-selected="true"]')?.textContent).toBe(
    "projects",
  );
  expect(state.navigate).not.toHaveBeenCalled();
});
