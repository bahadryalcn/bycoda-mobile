// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createContext, createElement, useEffect, useState, type PropsWithChildren } from "react";
import { createRoot, type Root } from "react-dom/client";
import { create } from "zustand";
import type { PressableProps } from "react-native";
import { NavigationRow } from "./navigation-row";

vi.mock("expo-router/react-navigation", () => ({ NavigationContext: createContext<unknown>(undefined) }));
vi.mock("@/state/security", () => ({ useSecurity: create(() => ({ appState: "active", windowFocused: true, status: "unlocked" })) }));
vi.mock("./use-reduced-motion", () => {
  const preference = create(() => ({ reduced: false }));
  return { useReducedMotionPreference: () => preference((state) => state.reduced), preference };
});
type NativeProps = PropsWithChildren<Pick<PressableProps,
  "accessibilityLabel" | "accessibilityRole" | "accessibilityState" | "disabled" | "style"
> & { onPress?: () => void; hitSlop?: PressableProps["hitSlop"] }>;
vi.mock("react-native", () => ({
  Pressable: ({ accessibilityLabel, accessibilityState, disabled, onPress, children, style, hitSlop }: NativeProps) =>
    createElement("button", { "aria-label": accessibilityLabel, "aria-busy": accessibilityState?.busy,
      "data-native-busy": String(accessibilityState?.busy), "data-native-selected": String(accessibilityState?.selected),
      "data-native-expanded": String(accessibilityState?.expanded),
      "data-layout": JSON.stringify(Array.isArray(style) ? Object.assign({}, ...style) : style),
      "data-hit-slop": JSON.stringify(hitSlop), disabled, onClick: onPress }, children),
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
  View: ({ children, style }: NativeProps) => {
    const width = style && typeof style === "object" && "borderTopColor" in style &&
      "width" in style && typeof style.width === "number" ? style.width : undefined;
    return createElement("div", { "data-ring-width": width }, children);
  },
  StyleSheet: { flatten: (style: unknown) => style },
}));
// Shared rows press through PanelUI; the native Pressable double above records their state.
vi.mock("panelui-native/primitives/animated-pressable", async () => ({ AnimatedPressable: (await import("react-native")).Pressable }));
vi.mock("panelui-native/components/chip", () => ({ Chip: ({ children }: PropsWithChildren) => createElement("button", null, children) }));
vi.mock("panelui-native/components/separator", () => ({ Separator: () => createElement("hr") }));
vi.mock("react-native-reanimated", () => ({ default: {
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
  createAnimatedComponent: (component: unknown) => component,
} }));
vi.mock("./theme", () => ({ useMobileTheme: vi.fn(() => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} })) }));
vi.mock("./motion", () => ({ haptic: { tap: vi.fn(), select: vi.fn() }, usePressMotion: () => ({ animatedStyle: {}, onPressIn: vi.fn(), onPressOut: vi.fn() }) }));
vi.mock("./typography", () => ({ Body: ({ children }: PropsWithChildren) => createElement("span", null, children) }));
vi.mock("./styles", () => ({ uiStyles: {} }));
vi.mock("./design-system", () => ({ controlClasses: () => "product-control" }));
vi.mock("./tokens", () => ({ colors: {}, metrics: { touchTarget: 48, visualControl: 32 }, fontSize: {},
  lineHeight: {}, gapIcon: 8, opacity: {}, radii: {}, space: {}, hitSlopFor: (visual: number) => (48 - visual) / 2 }));
vi.mock("lucide-react-native/icons/check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevron-right", () => ({ default: () => null }));
const loops = vi.hoisted(() => ({ started: 0, stopped: 0 }));
vi.mock("panelui-native/components/spinner", () => ({ Spinner: ({ size = "md" }: { size?: string }) => {
  useEffect(() => { loops.started++; return () => { loops.stopped++; }; }, []);
  return createElement("span", { "data-loop": "spinner", "data-ring-width": size === "lg" ? 32 : size === "sm" ? 16 : 24 });
} }));
vi.mock("panelui-native/components/progress-button", () => ({ ProgressButton: () => null }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
// Mirror the installed upstream's busy override and unconditional loading Spinner.
vi.mock("panelui-native/components/button", async () => {
  const { Pressable } = await import("react-native");
  const { Spinner } = await import("panelui-native/components/spinner");
  return { Button: ({ loading, children, startContent, disabled, accessibilityState, ...props }: NativeProps & {
    loading?: boolean; startContent?: import("react").ReactNode;
  }) => createElement(Pressable, { ...props, disabled: disabled || loading,
    accessibilityState: { ...accessibilityState, disabled: disabled || loading, busy: !!loading } },
    loading ? createElement(Spinner, { size: "sm" }) : startContent, children) };
});

import { NavigationContext } from "expo-router/react-navigation";
import { useSecurity } from "@/state/security";
import * as motionPreference from "./use-reduced-motion";
import { Button, IconButton } from "./buttons";
import { ChatCircleAction, ChatToolbarAction } from "./chat-controls";
import { BusyIndicator } from "./busy-indicator";

const preference = (motionPreference as unknown as { preference: { setState(value: { reduced: boolean }): void } }).preference;
let root: Root;
let container: HTMLDivElement;
let focused: boolean;
let busy: boolean;
let ownerMounts: number;
const command = vi.fn();

it("reserves both dimensions of an icon target when its parent can clip hit slop", async () => {
  await act(async () => root.render(createElement(IconButton, {
    label: "Close", onPress: command, reserveTouchTarget: true,
  })));
  const button = container.querySelector('[aria-label="Close"]')!;
  expect(JSON.parse(button.getAttribute("data-layout")!)).toMatchObject({ minWidth: 48, minHeight: 48 });
  expect(button.getAttribute("data-hit-slop")).toBeNull();
});
const listeners = new Map<string, Set<() => void>>();
const navigation = {
  isFocused: () => focused,
  addListener: (event: string, listener: () => void) => {
    const values = listeners.get(event) ?? new Set(); values.add(listener); listeners.set(event, values);
    return () => { values.delete(listener); };
  },
};
function Editor({ normalOnly = false }: { normalOnly?: boolean }) {
  const [draft] = useState("retained draft");
  useEffect(() => { ownerMounts++; }, []);
  return createElement("div", null,
    createElement("output", null, draft),
    createElement(Button, { label: "Save", busy, selected: true, onPress: command }),
    createElement(IconButton, { label: "Refresh", busy, expanded: true, onPress: command }),
    !normalOnly && createElement(ChatToolbarAction, { label: "Queue", busy, onPress: command }),
    !normalOnly && createElement(ChatCircleAction, { label: "Send", busy, onPress: command }),
    !normalOnly && createElement(BusyIndicator, { size: "sm" }));
}
const render = (withNavigation = true, normalOnly = false) => root.render(withNavigation
  ? createElement(NavigationContext.Provider, { value: navigation as never }, createElement(Editor, { normalOnly }))
  : createElement(Editor, { normalOnly }));
const setFocus = (value: boolean) => {
  focused = value;
  for (const listener of listeners.get(value ? "focus" : "blur") ?? []) listener();
};
const assertPending = () => {
  const buttons = [...container.querySelectorAll("button")];
  expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(["Save", "Refresh", "Queue", "Send"]);
  expect(buttons[0]!.getAttribute("data-native-selected")).toBe("true");
  expect(buttons[1]!.getAttribute("data-native-expanded")).toBe("true");
  for (const button of buttons) {
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("data-native-busy")).toBe("true");
    button.click();
  }
  expect(command).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Save");
  expect(container.textContent).toContain("retained draft");
  expect(ownerMounts).toBe(1);
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  useSecurity.setState({ appState: "active", windowFocused: true, status: "unlocked" });
  preference.setState({ reduced: false });
  focused = true; busy = true; ownerMounts = 0;
  loops.started = 0; loops.stopped = 0; listeners.clear(); command.mockReset();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});

it("keeps an action row busy and non-interactive while respecting reduced motion", async () => {
  await act(async () => root.render(createElement(NavigationRow, { label: "Save as note", busy: true, onPress: command })));
  const row = container.querySelector("button")!;
  expect(row.disabled).toBe(true);
  expect(row.getAttribute("data-native-busy")).toBe("true");
  row.click();
  expect(command).not.toHaveBeenCalled();
  expect(container.querySelectorAll("[data-loop]")).toHaveLength(1);
  await act(async () => preference.setState({ reduced: true }));
  expect(container.querySelectorAll("[data-loop]")).toHaveLength(0);
  expect(container.textContent).toContain("Save as note");
  await act(async () => root.render(createElement(NavigationRow, { label: "Save as note", busy: false, onPress: command })));
  container.querySelector("button")!.click();
  expect(command).toHaveBeenCalledOnce();
});
afterEach(async () => {
  await act(async () => root.unmount());
  expect([...listeners.values()].every((values) => values.size === 0)).toBe(true);
  container.remove();
});

it("stops hidden busy loops without clearing native busy/disabled or remounting the editor", async () => {
  await act(async () => render());
  expect(container.querySelectorAll("[data-loop]")).toHaveLength(4);
  assertPending();
  await act(async () => setFocus(false));
  expect(container.querySelectorAll("[data-loop]")).toHaveLength(0);
  expect(loops.stopped).toBe(4);
  assertPending();
  await act(async () => setFocus(true));
  expect(container.querySelectorAll("[data-loop]")).toHaveLength(4);
  assertPending();
});

for (const state of [{ appState: "background" }, { appState: "inactive" }, { windowFocused: false }] as const) {
  it(`suspends busy loops for ${JSON.stringify(state)} and resumes with the pending state intact`, async () => {
    await act(async () => render());
    await act(async () => useSecurity.setState(state));
    expect(container.querySelectorAll("[data-loop]")).toHaveLength(0); assertPending();
    await act(async () => useSecurity.setState({ appState: "active", windowFocused: true }));
    expect(container.querySelectorAll("[data-loop]")).toHaveLength(4); assertPending();
  });
}

it("supports navigator-absent boot and live reduced motion without enabling pending commands", async () => {
  await act(async () => render(false));
  await act(async () => preference.setState({ reduced: true }));
  expect(container.querySelectorAll("[data-loop]")).toHaveLength(0); assertPending();
  await act(async () => preference.setState({ reduced: false }));
  expect(container.querySelectorAll("[data-loop]")).toHaveLength(4); assertPending();
});

it("adds no route subscriptions for normal buttons and removes busy-only subscriptions when pending ends", async () => {
  busy = false;
  await act(async () => render(true, true));
  expect([...listeners.values()].reduce((sum, values) => sum + values.size, 0)).toBe(0);
  busy = true;
  await act(async () => render(true, true));
  expect([...listeners.values()].reduce((sum, values) => sum + values.size, 0)).toBe(4);
  busy = false;
  await act(async () => render(true, true));
  expect([...listeners.values()].reduce((sum, values) => sum + values.size, 0)).toBe(0);
  await act(async () => { container.querySelector("button")!.click(); });
  expect(command).toHaveBeenCalledTimes(1);
  expect(ownerMounts).toBe(1);
});

it("keeps default and button spinner footprints consistent when animation is suspended", async () => {
  await act(async () => root.render(createElement(NavigationContext.Provider, { value: navigation as never },
    createElement("div", null, createElement(Button, { label: "Save", busy: true, onPress: command }),
      createElement(IconButton, { label: "Refresh", busy: true, onPress: command }), createElement(BusyIndicator)))));
  const footprints = () => [...container.querySelectorAll("[data-ring-width]")].map((node) => node.getAttribute("data-ring-width"));
  const active = footprints();
  expect(active).toEqual(["16", "24"]);
  await act(async () => setFocus(false));
  expect(container.querySelectorAll("[data-loop]")).toHaveLength(0);
  expect(footprints()).toEqual(active);
});

it("draws one spinner for two busy controls of one operation and keeps both busy", async () => {
  await act(async () => root.render(createElement(NavigationContext.Provider, { value: navigation as never },
    createElement("div", null, createElement(IconButton, { label: "More", busy: true, onPress: command }),
      createElement(Button, { label: "Retry", busy: true, onPress: command })))));
  expect(container.querySelectorAll("[data-loop]")).toHaveLength(1);
  const buttons = [...container.querySelectorAll("button")];
  expect(buttons.map((button) => button.getAttribute("data-native-busy"))).toEqual(["true", "true"]);
  expect(buttons.every((button) => button.disabled)).toBe(true);
});
