// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { OverlayProvider, ScreenOverlay } from "./overlays";

const state = vi.hoisted(() => ({ status: "unlocked" as "unlocked" | "locked" }));
vi.mock("react-native", () => ({
  View: ({ children, collapsable, importantForAccessibility, pointerEvents }: PropsWithChildren<{
    collapsable?: boolean; importantForAccessibility?: string; pointerEvents?: string;
  }>) => h("div", { "data-collapsable": collapsable, "data-importance": importantForAccessibility, "data-pointer-events": pointerEvents }, children),
  BackHandler: { addEventListener: () => ({ remove: () => {} }) },
  StyleSheet: { absoluteFill: {} },
}));
vi.mock("expo-router/react-navigation", async () => ({ NavigationContext: (await import("react")).createContext(null) }));
vi.mock("react-native-reanimated", () => ({
  default: { View: ({ children, "aria-hidden": hidden }: PropsWithChildren<{ "aria-hidden"?: boolean }>) =>
    h("article", { "aria-hidden": hidden }, children) },
  useSharedValue: () => ({ value: 0 }),
  useAnimatedStyle: () => ({}),
  withTiming: (value: number) => value,
  Easing: { bezier: () => ({}) },
}));
vi.mock("react-native-worklets", () => ({ scheduleOnRN: () => {} }));
vi.mock("react-native-keyboard-controller", () => ({ KeyboardController: { isVisible: () => false, dismiss: () => Promise.resolve() } }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ uiStyles: {} }) }));
vi.mock("./motion", () => ({ motionTiming: {} }));
vi.mock("panelui-native/hooks/use-back-handler", () => ({ useBackHandler: () => {} }));
vi.mock("../state/security", () => ({
  useSecurity: Object.assign(
    (select: (value: unknown) => unknown) => select({ status: state.status }),
    { getState: () => ({ status: state.status }) },
  ),
}));
vi.mock("./private-content", () => {
  const value = { allowed: true, check: () => true };
  return { usePrivateContentAccess: () => value, PrivateContentAccessProvider: ({ children }: PropsWithChildren) => children };
});

let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  state.status = "unlocked";
  vi.unstubAllGlobals();
});

// The test mock never runs the fade callback, so a closing layer stays mounted exactly as it does during a real fade.
const Host = ({ open, title, content }: { open: boolean; title: string; content: string }) =>
  h(OverlayProvider, null,
    h("button", null, "Open details"),
    h(ScreenOverlay, { visible: open, children: null, label: title, onClose: () => {} },
      h("p", null, `${title}: ${content}`)));

it("a closing sheet keeps its last title and content during the exit, not the fallback that replaces them", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  root = createRoot(container);

  await act(async () => root!.render(h(Host, { open: true, title: "Log details", content: "stack line" })));
  expect(container.textContent).toContain("Log details: stack line");
  const triggerRegion = container.querySelector("button")!.parentElement!;
  expect(triggerRegion.getAttribute("data-importance")).toBe("no-hide-descendants");
  expect(triggerRegion.getAttribute("data-collapsable")).toBe("false");

  await act(async () => root!.render(h(Host, { open: false, title: "Log details", content: "No logs yet." })));
  expect(container.textContent).toContain("Log details: stack line");
  expect(container.textContent).not.toContain("No logs yet.");
  expect(container.querySelector("article")?.getAttribute("aria-hidden")).toBe("true");
  expect(triggerRegion.getAttribute("data-importance")).toBe("auto");
  expect(triggerRegion.getAttribute("data-pointer-events")).toBe("none");
  expect(triggerRegion.getAttribute("data-collapsable")).toBe("false");
});

it("a lock drops a closing sheet's retained content so it cannot reappear after unlock", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  root = createRoot(container);

  await act(async () => root!.render(h(Host, { open: true, title: "Secret", content: "private text" })));
  expect(container.textContent).toContain("private text");

  state.status = "locked";
  await act(async () => root!.render(h(Host, { open: true, title: "Secret", content: "private text" })));
  expect(container.textContent).not.toContain("private text");

  state.status = "unlocked";
  await act(async () => root!.render(h(Host, { open: false, title: "Secret", content: "private text" })));
  expect(container.textContent).not.toContain("private text");
});
