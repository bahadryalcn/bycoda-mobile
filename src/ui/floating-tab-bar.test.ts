// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FloatingTabBar } from "./floating-tab-bar";
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./dialogs", () => ({
  Sheet: ({ visible, title, children }: PropsWithChildren<{ visible: boolean; title: string }>) =>
    visible ? createElement("section", { role: "dialog", "aria-label": title }, children) : null,
}));
vi.mock("./navigation-row", () => ({
  NavigationRow: ({
    label,
    selected,
    onPress,
    accessibilityLabel,
    icon,
    trailing,
  }: {
    label: string;
    selected?: boolean;
    onPress(): void;
    accessibilityLabel?: string;
    icon?: import("react").ReactNode;
    trailing?: import("react").ReactNode;
  }) =>
    createElement(
      "button",
      {
        "data-destination": label,
        "aria-label": accessibilityLabel,
        "aria-selected": selected,
        onClick: onPress,
      },
      icon,
      label,
      trailing,
    ),
}));
vi.mock("./dock-icon", () => ({
  DockIcon: ({ name, color }: { name: string; color: string }) =>
    createElement("i", { "data-icon": name, "data-color": color }),
}));
const state = vi.hoisted(() => ({
  keyboard: false,
  rtl: false,
  insetLeft: 0,
  insetRight: 0,
  emit: vi.fn(() => ({ defaultPrevented: false })),
  navigate: vi.fn(),
  haptic: vi.fn(),
  reduceTransparency: false,
  canBlur: true,
  width: 320,
  height: 640,
  fontScale: 1,
}));
vi.mock("./theme", () => ({
  useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }),
}));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: () => null }));
vi.mock("expo-blur", () => ({
  BlurView: ({
    children,
    tint,
    intensity,
    experimentalBlurMethod,
  }: PropsWithChildren<{ tint: string; intensity: number; experimentalBlurMethod?: string }>) =>
    createElement(
      "div",
      { "data-blur": tint, "data-intensity": intensity, "data-method": experimentalBlurMethod },
      children,
    ),
}));
vi.mock("panelui-native/primitives/scrim", () => ({
  get canBlurHere() {
    return state.canBlur;
  },
  androidBlurProps: () => ({}),
}));
vi.mock("lucide-react-native/icons/plus", () => ({
  default: () => createElement("i", { "data-icon": "plus" }),
}));
vi.mock("./motion", () => ({ haptic: { select: state.haptic }, indicatorTiming: {} }));
vi.mock("./use-reduced-motion", () => ({ useReducedMotionPreference: () => true }));
vi.mock("panelui-native/primitives/animated-pressable", async () => {
  const { Pressable } = await import("react-native");
  return { AnimatedPressable: Pressable };
});
vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({ children }: PropsWithChildren) => createElement("div", null, children),
    Text: ({ children }: PropsWithChildren) =>
      createElement("span", { "data-label": "" }, children),
  },
  FadeIn: { duration: () => ({}) },
  LinearTransition: { duration: () => ({}) },
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: state.insetLeft, right: state.insetRight }),
}));
vi.mock("react-native-keyboard-controller", () => ({
  useKeyboardState: (select: (s: { isVisible: boolean }) => unknown) =>
    select({ isVisible: state.keyboard }),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  I18nManager: {
    get isRTL() {
      return state.rtl;
    },
  },
  AccessibilityInfo: {
    isReduceTransparencyEnabled: () => Promise.resolve(state.reduceTransparency),
    addEventListener: () => ({ remove: () => {} }),
  },
  StyleSheet: { hairlineWidth: 1 },
  useWindowDimensions: () => ({ width: state.width, height: state.height, fontScale: state.fontScale }),
  View: ({
    children,
    accessibilityRole,
    onLayout,
    style,
  }: PropsWithChildren<{
    accessibilityRole?: string;
    style?: unknown;
    onLayout?: (e: unknown) => void;
  }>) =>
    createElement(
      "div",
      {
        role: accessibilityRole,
        "data-style": JSON.stringify(style),
        "data-layout": onLayout ? "" : undefined,
        onFocus: onLayout ? () => onLayout({ nativeEvent: { layout: { height: 92 } } }) : undefined,
      },
      children,
    ),
  Text: ({
    children,
    numberOfLines,
    maxFontSizeMultiplier,
    adjustsFontSizeToFit,
  }: PropsWithChildren<{
    numberOfLines?: number;
    maxFontSizeMultiplier?: number;
    adjustsFontSizeToFit?: boolean;
  }>) =>
    createElement(
      "span",
      {
        "data-lines": numberOfLines,
        "data-scale-cap": maxFontSizeMultiplier,
        "data-shrink": adjustsFontSizeToFit,
      },
      children,
    ),
  Pressable: ({
    children,
    accessibilityLabel,
    accessibilityRole,
    onPress,
    onLongPress,
    disabled,
    style,
    "aria-selected": selected,
  }: PropsWithChildren<{
    accessibilityLabel: string;
    accessibilityRole: string;
    disabled?: boolean;
    style?: unknown;
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
        "data-style": JSON.stringify(
          typeof style === "function" ? style({ pressed: false }) : style,
        ),
        onClick: onPress,
        onContextMenu: onLongPress,
      },
      children,
    ),
}));
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
const routes = ["projects", "sessions", "inbox", "tools", "settings"].map((name) => ({
  name,
  key: name,
  params: { retained: name },
}));
const props = {
  state: { index: 0, routes },
  descriptors: Object.fromEntries(
    routes.map((route) => [
      route.key,
      {
        options: {
          title: route.name,
          tabBarIcon: () => createElement("i", { "data-destination-icon": route.name }),
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
  state.rtl = false;
  state.insetLeft = 0;
  state.insetRight = 0;
  state.reduceTransparency = false;
  state.canBlur = true;
  state.width = 320;
  state.height = 640;
  state.fontScale = 1;
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
it("uses an opaque navigation surface without a separate command", async () => {
  await render();
  expect(container.querySelector("[data-blur]")).toBeNull();
  expect(container.querySelectorAll("[role=tab]")).toHaveLength(5);
});
it("starts a session on tap without running a command on hold or selecting a tab", async () => {
  const onPress = vi.fn();
  await render({
    quickAction: { label: "New session", onPress },
  });
  const command = container.querySelector('[aria-label="New session"]') as HTMLElement;
  expect(command.getAttribute("role")).toBe("button");
  expect(JSON.parse(command.getAttribute("data-style")!).minHeight).toBeGreaterThanOrEqual(48);
  await act(async () => command.click());
  expect(onPress).toHaveBeenCalledTimes(1);
  await act(async () => command.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })));
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(state.navigate).not.toHaveBeenCalled();
});
it("fits all five destinations beside the new-session command at 320 without a divider", async () => {
  state.fontScale = 2;
  await render({ quickAction: { label: "New session", onPress: vi.fn() } });
  expect(container.querySelector('[aria-label^="More"]')).toBeNull();
  expect(container.querySelector('[aria-label="Voice assistant"]')).toBeNull();
});
it("keeps large-text destinations reachable while the quick action owns a slot", async () => {
  state.fontScale = 2;
  // Narrower than any supported phone, so a destination moves to More.
  state.width = 290;
  await render({
    quickAction: {
      label: "New session",
      onPress: vi.fn(),
    },
  });
  expect(container.querySelector('[aria-label="New session"]')).not.toBeNull();
  const more = [...container.querySelectorAll('[role="tab"]')].find((tab) =>
    tab.getAttribute("aria-label")?.startsWith("More"),
  ) as HTMLElement;
  await act(async () => more.click());
  const sheet = container.querySelector('[role="dialog"][aria-label="More"]');
  expect(sheet?.querySelector('[data-destination="settings"] [data-destination-icon="settings"]')).toBeTruthy();
});
it("closes the overflow sheet when a window resize makes every destination visible", async () => {
  state.fontScale = 2;
  state.width = 200;
  await render();
  const more = container.querySelector('[aria-label^="More"]') as HTMLElement;
  await act(async () => more.click());
  expect(container.querySelector('[data-destination="settings"]')).not.toBeNull();
  state.width = 520;
  await render();
  expect(container.querySelector('[aria-label^="More"]')).toBeNull();
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  state.width = 200;
  await render();
  expect(container.querySelector('[data-destination="settings"]')).toBeNull();
});
it("labels every tab, keeps every accessible name and never changes the tab row for the action", async () => {
  await render();
  const tabs = [...container.querySelectorAll("[role=tab]")];
  expect(tabs[0]!.getAttribute("aria-label")).toBe("projects");
  for (const tab of tabs) expect(tab.textContent).not.toContain(tab.getAttribute("aria-label"));
  expect(tabs[1]!.getAttribute("aria-label")).toBe("sessions, 99+");
  await render();
  expect(container.querySelectorAll("[role=tab]")).toHaveLength(tabs.length);
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
  await act(async () => tabs[4].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })));
  expect(state.emit).toHaveBeenLastCalledWith({
    type: "tabLongPress",
    target: "settings",
  });
});
it("honors prevented navigation and follows an already-open keyboard without changing the selected route", async () => {
  state.emit.mockReturnValue({ defaultPrevented: true });
  await render();
  await act(async () => (container.querySelectorAll("[role=tab]")[2] as HTMLElement).click());
  expect(state.navigate).not.toHaveBeenCalled();
  expect(state.haptic).not.toHaveBeenCalled();
  state.keyboard = true;
  await render();
  expect(container.querySelector("[role=tablist]")).toBeNull();
  state.keyboard = false;
  await render();
  expect(container.querySelector('[aria-selected="true"]')?.getAttribute("aria-label")).toBe(
    "projects",
  );
  expect(state.navigate).not.toHaveBeenCalled();
});

function tabStyle(tab: Element) {
  return Object.assign({}, ...JSON.parse(tab.getAttribute("data-style") ?? "[]").filter(Boolean));
}
it("keeps long translated labels readable without font shrinking or scaling caps", async () => {
  const descriptors = Object.fromEntries(
    routes.map((route) => [
      route.key,
      {
        ...props.descriptors[route.key]!,
        options: {
          ...props.descriptors[route.key]!.options,
          title:
            route.name === "settings"
              ? "Benachrichtigungseinstellungen"
              : "Çalışma alanı ve projeler 👩🏽‍💻",
        },
      },
    ]),
  );
  await render({ descriptors });
  const tabs = [...container.querySelectorAll("[role=tab]")];
  for (const tab of tabs) {
    expect(tab.getAttribute("aria-label")).toContain(
      tab === tabs[tabs.length - 1] ? "Benachrichtigung" : "Çalışma",
    );
    expect(tab.textContent).not.toContain("Çalışma");
    expect(tabStyle(tab).minHeight).toBeGreaterThanOrEqual(48);
  }
});
it("keeps all five icon destinations at large text on a phone", async () => {
  state.fontScale = 2;
  await render();
  expect(container.querySelectorAll("[role=tab]")).toHaveLength(5);
  expect(container.querySelector('[aria-label^="More"]')).toBeNull();
});
it("keeps one row on a genuinely narrow window and reaches overflow destinations through More", async () => {
  state.fontScale = 2;
  state.width = 200;
  await render();
  const tabs = [...container.querySelectorAll("[role=tab]")];
  expect(tabs).toHaveLength(3);
  expect(tabs.map((tab) => tabStyle(tab).width)).toEqual(Array(3).fill(48));
  const listStyle = JSON.parse(
    container.querySelector("[role=tablist]")!.getAttribute("data-style")!,
  );
  expect(listStyle.flexWrap).toBeUndefined();
  await act(async () => (container.querySelector('[aria-label="More"]') as HTMLElement).click());
  const destinations = [...container.querySelectorAll("[data-destination]")];
  expect(destinations.map((row) => row.textContent)).toEqual(["inbox", "tools", "settings"]);
  await act(async () => (destinations[2] as HTMLElement).click());
  expect(state.navigate).toHaveBeenLastCalledWith("settings");
  expect(container.querySelector("[data-destination]")).toBeNull();
});
it("uses explicit accessibility descriptions for running counts", async () => {
  const descriptors = {
    ...props.descriptors,
    sessions: {
      ...props.descriptors.sessions!,
      options: {
        ...props.descriptors.sessions!.options,
        tabBarAccessibilityLabel: "Sessions, 99+ running sessions",
      },
    },
  };
  await render({ descriptors });
  expect(container.querySelector('[aria-label="Sessions, 99+ running sessions"]')).not.toBeNull();
});
it("retains running counts when a narrow window moves Sessions into overflow", async () => {
  state.fontScale = 3;
  state.width = 160;
  const descriptors = {
    ...props.descriptors,
    sessions: {
      ...props.descriptors.sessions!,
      options: {
        ...props.descriptors.sessions!.options,
        tabBarAccessibilityLabel: "Sessions, 99+ running sessions",
      },
    },
  };
  await render({ descriptors });
  const more = container.querySelector(
    '[aria-label="More. Sessions, 99+ running sessions"]',
  ) as HTMLElement;
  expect(more).not.toBeNull();
  expect(more.textContent).toContain("99+");
  await act(async () => more.click());
  const session = container.querySelector('[data-destination="sessions"]');
  expect(session?.getAttribute("aria-label")).toBe("Sessions, 99+ running sessions");
  expect(session?.textContent).toContain("99+");
});

it("places create inside the content-width dock beside five tabs when they fit", async () => {
  state.width = 360;
  await render({
    quickAction: {
      label: "New session",
      onPress: vi.fn(),
    },
  });
  const command = container.querySelector('[aria-label="New session"]')!;
  const rail = container.querySelector('[role="tablist"]')!;
  expect(rail.contains(command)).toBe(false);
  expect(rail.parentElement?.contains(command)).toBe(true);
  const dockStyle = JSON.parse(rail.parentElement!.getAttribute("data-style")!);
  expect(dockStyle.width).toBeUndefined();
  expect(dockStyle.borderWidth).toBe(1);
  expect(dockStyle.padding).toBe(6);
  expect(dockStyle.borderRadius).toBe(24);
  expect(rail.querySelectorAll('[role="tab"]')).toHaveLength(5);
  expect(JSON.parse(command.getAttribute("data-style")!).width).toBe(48);
  expect([...rail.querySelectorAll('[role="tab"]')].map((tab) => tabStyle(tab).width)).toEqual(
    Array(5).fill(48),
  );
});

it("keeps narrow large-type navigation and create independently reachable", async () => {
  // A genuinely narrow window: icon slots do not shrink with text, so only width forces overflow.
  state.width = 180;
  state.fontScale = 3;
  await render({
    state: { ...props.state, index: 4 },
    quickAction: {
      label: "Yeni oturum oluştur",
      onPress: vi.fn(),
    },
  });
  const command = container.querySelector('[aria-label="Yeni oturum oluştur"]')!;
  const rail = container.querySelector('[role="tablist"]')!;
  expect(rail.contains(command)).toBe(false);
  expect(rail.querySelectorAll('[role="tab"]')).toHaveLength(2);
  const selected = rail.querySelector('[aria-selected="true"]') as HTMLElement;
  expect(selected.getAttribute("aria-label")).toContain("More");
  expect(tabStyle(selected).minHeight).toBeGreaterThanOrEqual(48);
  await act(async () => selected.click());
  const destinations = [...container.querySelectorAll("[data-destination]")];
  expect(destinations.map((row) => row.getAttribute("data-destination"))).toEqual([
    "sessions",
    "inbox",
    "tools",
    "settings",
  ]);
  expect(
    container.querySelector('[data-destination="settings"]')?.getAttribute("aria-selected"),
  ).toBe("true");
  expect(container.querySelector('[aria-label="Yeni oturum oluştur"]')).toBe(command);
});

it("maps asymmetric physical safe areas to logical RTL dock padding", async () => {
  state.rtl = true;
  state.insetLeft = 8;
  state.insetRight = 28;
  await render();
  const host = container.querySelector("[data-layout]")!;
  const style = JSON.parse(host.getAttribute("data-style")!);
  expect(style.paddingStart).toBe(28);
  expect(style.paddingEnd).toBe(8);
});

it("keeps active tabs unfilled with a single 4dp indicator", async () => {
  await render();
  const tabs = [...container.querySelectorAll("[role=tab]")];
  for (const tab of tabs) expect(tabStyle(tab).backgroundColor).toBeUndefined();
  const dots = [...tabs[0]!.querySelectorAll("[data-style]")]
    .map((node) => JSON.parse(node.getAttribute("data-style")!))
    .filter((style) => style.width === 4 && style.height === 4);
  expect(dots).toHaveLength(1);
});
it("shows labels in a wider dock on tablets and landscape large phones", async () => {
  for (const [width, height] of [[834, 1194], [844, 390]] as const) {
    state.width = width;
    state.height = height;
    await render();
    const tabs = [...container.querySelectorAll("[role=tab]")];
    expect(tabs).toHaveLength(5);
    expect(tabs.map((tab) => tab.textContent)).toEqual(["projects", "99+sessions", "inbox", "tools", "settings"]);
    expect(JSON.parse(tabs[0]!.getAttribute("data-style")!).width).toBe(88);
    expect(container.querySelector("[data-lines='2']")).not.toBeNull();
  }
});
it("keeps the icon-only dock on a portrait phone", async () => {
  state.width = 390;
  state.height = 844;
  await render();
  for (const tab of container.querySelectorAll("[role=tab]")) {
    expect(tab.textContent).not.toContain("projects");
  }
});
