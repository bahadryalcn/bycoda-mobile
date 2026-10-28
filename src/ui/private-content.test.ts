// @vitest-environment jsdom
import { act, createElement, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { PrivateContentBoundary, usePrivateContentAccess } from "./private-content";
import { OverlayProvider, ScreenOverlay } from "./overlays";
const state = vi.hoisted(() => ({
  unlocked: true,
  keyboardVisible: false,
  back: null as (() => boolean) | null,
  dismissKeyboard: vi.fn(async () => {}),
}));
vi.mock("react-native", () => {
  const View = ({ children, style, ref, accessibilityElementsHidden, importantForAccessibility: _important, accessibilityViewIsModal: _modal, pointerEvents, ...props }: PropsWithChildren<Record<string, unknown>>) => {
    const flatten = (value: unknown): Record<string, unknown> => Array.isArray(value) ? Object.assign({}, ...value.map(flatten)) : value && typeof value === "object" ? value as Record<string, unknown> : {};
    return createElement("div", { ...props, ref, style: flatten(style), "data-private-hidden": String(accessibilityElementsHidden ?? false), "data-pointer-events": pointerEvents }, children);
  };
  return { View, StyleSheet: { absoluteFill: {} }, BackHandler: {
    addEventListener: (_event: string, callback: () => boolean) => {
      state.back = callback;
      return { remove() { if (state.back === callback) state.back = null; } };
    },
  } };
});
vi.mock("react-native-keyboard-controller", () => ({ KeyboardController: {
  isVisible: () => state.keyboardVisible,
  dismiss: state.dismissKeyboard,
} }));
vi.mock("react-native-reanimated", () => ({ default: { View: ({ children, style, accessibilityElementsHidden, pointerEvents, ...props }: PropsWithChildren<Record<string, unknown>>) => {
  const flatten = (value: unknown): Record<string, unknown> => Array.isArray(value) ? Object.assign({}, ...value.map(flatten)) : value && typeof value === "object" ? value as Record<string, unknown> : {};
  const { accessibilityViewIsModal: _modal, importantForAccessibility: _important, ...rest } = props;
  return createElement("div", { ...rest, style: flatten(style), "data-private-hidden": String(accessibilityElementsHidden ?? false), "data-pointer-events": pointerEvents }, children);
} }, useSharedValue: (value: number) => ({ value }), useAnimatedStyle: (fn: () => unknown) => fn(), withTiming: (value: number) => value, Easing: { bezier: () => undefined } }));
vi.mock("react-native-worklets", () => ({ scheduleOnRN: vi.fn() }));
vi.mock("../state/security", () => ({ useSecurity: Object.assign((select: (value: { status: string }) => unknown) => select({ status: state.unlocked ? "unlocked" : "locked" }), { getState: () => ({ status: state.unlocked ? "unlocked" : "locked" }) }) }));
vi.mock("./theme", () => ({ useMobileTheme: () => {} }));
vi.mock("./styles", () => ({ uiStyles: { screen: { flex: 1 } } }));
vi.mock("./motion", () => ({ motionTiming: {} }));
vi.mock("./tokens", () => ({ motion: { sheet: 1 } }));
let access: ReturnType<typeof usePrivateContentAccess>; let root: ReturnType<typeof createRoot> | undefined; let container: HTMLDivElement;
function Owner() { access = usePrivateContentAccess(); const [draft] = useState("Preserved draft"); return createElement("div", null,
  createElement("input", { "aria-label": "Draft", value: draft, readOnly: true }),
  createElement(ScreenOverlay, { visible: true, label: "Private sheet", onClose() {}, children: createElement("input", { "aria-label": "Portal draft", defaultValue: "Private portal" }) }));
}
async function render(visible: boolean, guard: () => boolean = () => true) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container ??= document.createElement("div"); root ??= createRoot(container);
  await act(async () => root!.render(createElement(OverlayProvider, null, createElement(PrivateContentBoundary, { visible, isAllowed: guard }, createElement(Owner)))));
}
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; container = undefined as never; state.unlocked = true; state.keyboardVisible = false; state.back = null; state.dismissKeyboard.mockClear(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("conceals content and externally registered portals without remounting their draft owners", async () => {
  await render(true); const input = container.querySelector<HTMLInputElement>('input[aria-label="Draft"]')!; const portal = container.querySelector<HTMLInputElement>('input[aria-label="Portal draft"]')!;
  expect(input.value).toBe("Preserved draft"); expect(portal).toBeTruthy();
  await render(false); expect(access.check()).toBe(false); expect(container.querySelector('input[aria-label="Draft"]')).toBe(input); expect(container.querySelector('input[aria-label="Portal draft"]')).toBe(portal);
  const hidden = (node: Element) => { let item: Element | null = node; while (item) { if ((item as HTMLElement).style?.display === "none" && item.getAttribute("aria-hidden") === "true") return true; item = item.parentElement; } return false; };
  expect(hidden(input)).toBe(true); expect(hidden(portal)).toBe(true);
  await render(true); expect(container.querySelector('input[aria-label="Draft"]')).toBe(input); expect(access.check()).toBe(true);
});
it("captured request guards observe immediate revocation and boundary disposal", async () => {
  let permitted = true; await render(true, () => permitted); const captured = access;
  permitted = false; expect(captured.check()).toBe(false); permitted = true;
  await act(async () => root?.unmount()); root = undefined; expect(captured.check()).toBe(false);
});

async function renderBackTarget(onClose: () => void) {
  vi.stubEnv("EXPO_OS", "android");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root!.render(createElement(OverlayProvider, null,
    createElement(ScreenOverlay, { visible: true, label: "Editor", onClose,
      children: createElement("input", { "aria-label": "Retained editor", defaultValue: "Draft" }) }))));
}

it("dismisses the keyboard before closing an overlay, including repeated Back during dismissal", async () => {
  const onClose = vi.fn();
  await renderBackTarget(onClose);
  const input = container.querySelector("input")!;
  state.keyboardVisible = true;
  expect(state.back?.()).toBe(true);
  expect(state.dismissKeyboard).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
  // The native visibility owner remains true until keyboardDidHide.
  expect(state.back?.()).toBe(true);
  expect(onClose).not.toHaveBeenCalled();
  expect(container.querySelector("input")).toBe(input);
  expect(input.value).toBe("Draft");
  state.keyboardVisible = false;
  expect(state.back?.()).toBe(true);
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("delegates hidden-keyboard Back to the existing close guard without removing its overlay", async () => {
  const requestClose = vi.fn();
  await renderBackTarget(requestClose);
  const input = container.querySelector("input")!;
  expect(state.back?.()).toBe(true);
  expect(requestClose).toHaveBeenCalledTimes(1);
  expect(state.dismissKeyboard).not.toHaveBeenCalled();
  // A dirty/pending close owner may decline; the registry must not remove it.
  expect(container.querySelector("input")).toBe(input);
});

it("consumes a captured Back callback after locking without invoking keyboard or private close actions", async () => {
  const onClose = vi.fn();
  await renderBackTarget(onClose);
  const back = state.back!;
  state.keyboardVisible = true;
  state.unlocked = false;
  expect(back()).toBe(true);
  expect(state.dismissKeyboard).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});
