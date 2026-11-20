// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { OverlayProvider, ScreenOverlay } from "./overlays";

const back = vi.hoisted(() => ({ listeners: new Set<() => boolean>() }));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => h("div", null, children),
  BackHandler: {
    addEventListener: (_event: string, listener: () => boolean) => {
      back.listeners.add(listener);
      return { remove: () => back.listeners.delete(listener) };
    },
  },
  StyleSheet: { absoluteFill: {} },
}));
vi.mock("expo-router/react-navigation", async () => ({ NavigationContext: (await import("react")).createContext(null) }));
vi.mock("react-native-reanimated", () => ({
  default: { View: ({ children }: PropsWithChildren) => h("article", null, children) },
  useSharedValue: () => ({ value: 0 }),
  useAnimatedStyle: () => ({}),
  withTiming: (value: number) => value,
  Easing: { bezier: () => ({}) },
}));
vi.mock("react-native-worklets", () => ({ scheduleOnRN: () => {} }));
vi.mock("react-native-keyboard-controller", () => ({ KeyboardController: { isVisible: () => false, dismiss: () => Promise.resolve() } }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ uiStyles: {} }) }));
vi.mock("./motion", () => ({ motionTiming: {} }));
vi.mock("../state/security", () => ({ useSecurity: Object.assign((select: (value: unknown) => unknown) => select({ status: "unlocked" }), { getState: () => ({ status: "unlocked" }) }) }));
vi.mock("./private-content", () => {
  const value = { allowed: true, check: () => true };
  return { usePrivateContentAccess: () => value, PrivateContentAccessProvider: ({ children }: PropsWithChildren) => children };
});

let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  back.listeners.clear();
  vi.unstubAllGlobals();
});

function pressBack() {
  for (const listener of [...back.listeners]) listener();
}

it("a sheet that is closing does not own Android back, so the next press reaches the visible layer once", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  root = createRoot(container);
  const baseClose = vi.fn();
  const sheetClose = vi.fn();
  // The test mock never runs the fade callback, so the closed sheet stays mounted just like it does during a real fade.
  const Host = ({ open }: { open: boolean }) =>
    h(OverlayProvider, null,
      h(ScreenOverlay, { visible: true, children: null, label: "Base", onClose: baseClose }, h("p", null, "Base")),
      h(ScreenOverlay, { visible: open, children: null, label: "Sheet", onClose: sheetClose }, h("p", null, "Sheet")));

  await act(async () => root!.render(h(Host, { open: true })));
  expect(back.listeners.size).toBe(1);

  await act(async () => root!.render(h(Host, { open: false })));
  expect(container.textContent).toContain("Sheet");
  expect(back.listeners.size).toBe(1);

  await act(async () => pressBack());
  expect(baseClose).toHaveBeenCalledTimes(1);
  expect(sheetClose).not.toHaveBeenCalled();
});

it("a closing sheet with nothing visible beneath it releases the back button entirely", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  root = createRoot(container);
  const sheetClose = vi.fn();
  const Host = ({ open }: { open: boolean }) =>
    h(OverlayProvider, null,
      h(ScreenOverlay, { visible: open, children: null, label: "Sheet", onClose: sheetClose }, h("p", null, "Sheet")));

  await act(async () => root!.render(h(Host, { open: true })));
  expect(back.listeners.size).toBe(1);

  await act(async () => root!.render(h(Host, { open: false })));
  expect(back.listeners.size).toBe(0);
  expect(sheetClose).not.toHaveBeenCalled();
});
