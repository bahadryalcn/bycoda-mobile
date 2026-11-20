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

function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  root = createRoot(container);
  return container;
}

it("editing a visible sheet's content updates the sheet it belongs to", async () => {
  const container = mount();
  const Host = ({ text }: { text: string }) =>
    h(OverlayProvider, null,
      h(ScreenOverlay, { visible: true, label: "Sheet", onClose: () => {}, children: h("p", null, text) }));

  await act(async () => root!.render(h(Host, { text: "draft 1" })));
  await act(async () => root!.render(h(Host, { text: "draft 12" })));

  expect(container.textContent).toContain("draft 12");
  expect(container.textContent).not.toContain("draft 1 ");
});

it("a sheet sliding out keeps the content it showed while visible, not its owner's fallback", async () => {
  const container = mount();
  const Host = ({ open, fallback }: { open: boolean; fallback: boolean }) =>
    h(OverlayProvider, null,
      h(ScreenOverlay, {
        visible: open,
        label: "Sheet",
        onClose: () => {},
        children: fallback ? h("p", null, "No logs yet.") : h("p", null, "Log details"),
      }));

  await act(async () => root!.render(h(Host, { open: true, fallback: false })));
  await act(async () => root!.render(h(Host, { open: false, fallback: true })));

  expect(container.textContent).toContain("Log details");
  expect(container.textContent).not.toContain("No logs yet.");
});

it("Android back calls the latest close handler after an inline handler is replaced", async () => {
  mount();
  const first = vi.fn();
  const second = vi.fn();
  const Host = ({ onClose }: { onClose: () => void }) =>
    h(OverlayProvider, null,
      h(ScreenOverlay, { visible: true, label: "Sheet", onClose, children: h("p", null, "Sheet") }));

  await act(async () => root!.render(h(Host, { onClose: first })));
  await act(async () => root!.render(h(Host, { onClose: second })));
  await act(async () => pressBack());

  expect(second).toHaveBeenCalledTimes(1);
  expect(first).not.toHaveBeenCalled();
});
