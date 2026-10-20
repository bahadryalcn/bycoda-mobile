// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createContext, createElement, useEffect, type PropsWithChildren } from "react";
import { createRoot, type Root } from "react-dom/client";
import { create } from "zustand";

vi.mock("expo-router/react-navigation", () => ({ NavigationContext: createContext<unknown>(undefined) }));
vi.mock("@/state/security", () => ({
  useSecurity: create(() => ({ appState: "active", windowFocused: true, status: "loading" })),
}));
vi.mock("./use-reduced-motion", () => {
  const preference = create(() => ({ reduced: false }));
  return { useReducedMotionPreference: () => preference((state) => state.reduced), preference };
});
vi.mock("react-native", () => ({
  View: ({ children, accessibilityRole, accessibilityLabel, accessibilityState }: PropsWithChildren<{
    accessibilityRole?: string; accessibilityLabel?: string; accessibilityState?: { busy?: boolean };
  }>) => createElement("div", { role: accessibilityRole, "aria-label": accessibilityLabel, "aria-busy": accessibilityState?.busy }, children),
  Text: ({ children }: PropsWithChildren) => createElement("span", null, children),
  StyleSheet: { flatten: (style: unknown) => style },
}));
vi.mock("react-native-reanimated", () => ({ default: { View: ({ children }: PropsWithChildren) => createElement("div", null, children) } }));
vi.mock("./theme", () => ({ useMobileTheme: vi.fn() }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./motion", () => ({ reveal: undefined }));
vi.mock("./typography", () => ({ Body: ({ children }: PropsWithChildren) => createElement("span", null, children) }));
vi.mock("./layout", () => ({ Row: "div" }));
vi.mock("./buttons", () => ({ Button: "button" }));
vi.mock("./styles", () => ({ uiStyles: {} }));
vi.mock("./tokens", () => ({ colors: {}, semanticColors: {}, space: {}, radii: {} }));
vi.mock("lucide-react-native/icons/info", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/circle-check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/triangle-alert", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/circle-alert", () => ({ default: () => null }));
vi.mock("panelui-native/components/badge", () => ({ Badge: "span" }));
vi.mock("panelui-native/components/alert", () => ({ Alert: "div" }));
const loops = vi.hoisted(() => ({ mounted: 0, stopped: 0 }));
vi.mock("panelui-native/components/spinner", () => ({ Spinner: () => {
  useEffect(() => { loops.mounted++; return () => { loops.stopped++; }; }, []);
  return createElement("span", { "data-loop": "spinner" });
} }));
vi.mock("panelui-native/components/skeleton", () => ({ Skeleton: () => {
  useEffect(() => { loops.mounted++; return () => { loops.stopped++; }; }, []);
  return createElement("span", { "data-loop": "skeleton" });
} }));

import { NavigationContext } from "expo-router/react-navigation";
import { useSecurity } from "@/state/security";
import * as motionPreference from "./use-reduced-motion";
import { Loading, Skeleton } from "./feedback";

const preference = (motionPreference as unknown as { preference: { setState(value: { reduced: boolean }): void } }).preference;
let root: Root;
let container: HTMLDivElement;
let focused: boolean;
const listeners = new Map<string, Set<() => void>>();
const navigation = {
  isFocused: () => focused,
  addListener: (event: string, listener: () => void) => {
    const values = listeners.get(event) ?? new Set();
    values.add(listener);
    listeners.set(event, values);
    return () => { values.delete(listener); };
  },
};
const controls = () => createElement("div", null, createElement(Loading, { label: "Connecting" }), createElement(Skeleton));
const render = (withNavigation: boolean) => root.render(withNavigation
  ? createElement(NavigationContext.Provider, { value: navigation as never }, controls())
  : controls());
const setFocus = (value: boolean) => {
  focused = value;
  for (const listener of listeners.get(value ? "focus" : "blur") ?? []) listener();
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  useSecurity.setState({ appState: "active", windowFocused: true, status: "loading" });
  preference.setState({ reduced: false });
  loops.mounted = 0;
  loops.stopped = 0;
  focused = true;
  listeners.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  expect([...listeners.values()].every((values) => values.size === 0)).toBe(true);
  container.remove();
});

it("supports boot without navigation and before unlock, preserving feedback semantics", async () => {
  await act(async () => render(false));
  expect(container.querySelectorAll("[data-loop]")).toHaveLength(7);
  expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-label")).toBe("Connecting");
  await act(async () => { useSecurity.setState({ status: "locked" }); });
  expect(container.querySelectorAll("[data-loop]")).toHaveLength(7);
});

it("unmounts hidden-route loops, retains static placeholders and restarts on focus", async () => {
  await act(async () => render(true));
  expect(loops.mounted).toBe(7);
  await act(async () => setFocus(false));
  expect(container.querySelectorAll("[data-loop]")).toHaveLength(0);
  expect(loops.stopped).toBe(7);
  expect(container.textContent).toContain("Connecting");
  expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-busy")).toBe("true");
  await act(async () => setFocus(true));
  expect(container.querySelectorAll("[data-loop]")).toHaveLength(7);
});

for (const state of [{ appState: "background" }, { appState: "inactive" }, { windowFocused: false }] as const) {
  it(`suspends boot-level loops for ${JSON.stringify(state)} and resumes`, async () => {
    await act(async () => render(false));
    await act(async () => useSecurity.setState(state));
    expect(container.querySelectorAll("[data-loop]")).toHaveLength(0);
    await act(async () => useSecurity.setState({ appState: "active", windowFocused: true }));
    expect(container.querySelectorAll("[data-loop]")).toHaveLength(7);
  });
}

it("reacts to live reduced-motion changes while keeping loading content", async () => {
  await act(async () => render(true));
  await act(async () => preference.setState({ reduced: true }));
  expect(container.querySelectorAll("[data-loop]")).toHaveLength(0);
  expect(container.textContent).toContain("Connecting");
  await act(async () => preference.setState({ reduced: false }));
  expect(container.querySelectorAll("[data-loop]")).toHaveLength(7);
});
