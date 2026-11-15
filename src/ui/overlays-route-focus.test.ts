// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { NavigationContext } from "expo-router/react-navigation";
import { OverlayProvider, ScreenOverlay } from "./overlays";

const focus = vi.hoisted(() => ({ current: true, listeners: new Set<() => void>() }));
vi.mock("expo-router/react-navigation", async () => ({ NavigationContext: (await import("react")).createContext(null) }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children), BackHandler: { addEventListener: () => ({ remove: () => {} }) }, StyleSheet: { absoluteFill: {} } }));
vi.mock("react-native-reanimated", () => ({ default: { View: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => h("article", { "aria-hidden": props["aria-hidden"] as boolean, "data-hidden": JSON.stringify(props.style).includes('"display":"none"') }, children) }, useSharedValue: () => ({ value: 0 }), useAnimatedStyle: () => ({}), withTiming: (value: number) => value, Easing: { bezier: () => ({}) } }));
vi.mock("react-native-worklets", () => ({ scheduleOnRN: () => {} }));
vi.mock("react-native-keyboard-controller", () => ({ KeyboardController: { isVisible: () => false } }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ uiStyles: {} }) }));
vi.mock("./motion", () => ({ motionTiming: {} }));
vi.mock("../state/security", () => ({ useSecurity: Object.assign((select: (value: unknown) => unknown) => select({ status: "unlocked" }), { getState: () => ({ status: "unlocked" }) }) }));
vi.mock("./private-content", () => { const value = { allowed: true, check: () => true }; return { usePrivateContentAccess: () => value, PrivateContentAccessProvider: ({ children }: PropsWithChildren) => children }; });
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root?.unmount()); focus.current = true; focus.listeners.clear(); vi.unstubAllGlobals(); });

it("hides blurred route layers and nested sheets without closing or remounting drafts; global consent stays visible", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); root = createRoot(container);
  const close = vi.fn(), mounted = vi.fn();
  function Editor() { const [draft] = useState(() => { mounted(); return "Unsaved draft"; }); return h("div", null, h("textarea", { defaultValue: draft }), h(ScreenOverlay, { visible: true, children: null, label: "Nested", onClose: close }, h("p", null, "Nested picker"))); }
  const navigation = { isFocused: () => focus.current, addListener: (_event: string, listener: () => void) => { focus.listeners.add(listener); return () => focus.listeners.delete(listener); } };
  await act(async () => root.render(h(OverlayProvider, null,
    h(ScreenOverlay, { visible: true, children: null, label: "Consent", onClose: close }, h("p", null, "Global consent")),
    h(NavigationContext.Provider, { value: navigation as never }, h(ScreenOverlay, { visible: true, children: null, label: "Settings", onClose: close }, h(Editor))))));
  const input = container.querySelector("textarea")!; input.value = "Edited unsaved draft";
  const layer = () => input.closest("article")!;
  await act(async () => { focus.current = false; for (const listener of focus.listeners) listener(); });
  expect(layer().getAttribute("data-hidden")).toBe("true");
  const nested = [...container.querySelectorAll("article")].find(node => node.textContent === "Nested picker")!;
  expect(nested.getAttribute("data-hidden")).toBe("true");
  const global = [...container.querySelectorAll("article")].find(node => node.textContent === "Global consent")!;
  expect(global.getAttribute("aria-hidden")).toBe("false");
  expect(close).not.toHaveBeenCalled();
  await act(async () => { focus.current = true; for (const listener of focus.listeners) listener(); });
  expect(container.querySelector("textarea")).toBe(input);
  expect(input.value).toBe("Edited unsaved draft");
  expect(mounted).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
});
