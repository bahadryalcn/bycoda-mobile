// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  reduced: false,
  pressIn: vi.fn(),
  pressOut: vi.fn(),
  motion: vi.fn(),
  action: vi.fn(),
}));
vi.mock("./theme", () => ({ useMobileTheme: () => {} }));
vi.mock("./use-reduced-motion", () => ({ useReducedMotionPreference: () => state.reduced }));
vi.mock("./motion", () => ({
  usePressMotion: (depth: number) => {
    state.motion(depth);
    return {
      animatedStyle: { transform: [{ scale: depth }] },
      onPressIn: state.pressIn,
      onPressOut: state.pressOut,
    };
  },
}));
vi.mock("./buttons", () => ({ IconButton: () => null }));
vi.mock("./busy-indicator", () => ({ BusyIndicator: () => null }));
vi.mock("lucide-react-native/icons/chevron-right", () => ({ default: () => null }));
vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({ children, style }: PropsWithChildren<{ style: unknown }>) => {
      const flat = Object.assign(
        {},
        ...(Array.isArray(style) ? style.flat().filter(Boolean) : [style]),
      );
      return createElement("div", { "data-animated-scale": flat.transform?.[0]?.scale }, children);
    },
  },
}));
vi.mock("./typography", () => ({
  Body: ({
    children,
    numberOfLines,
  }: {
    children: import("react").ReactNode;
    numberOfLines?: number;
  }) => createElement("span", { "data-lines": numberOfLines }, children),
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
  Pressable: ({
    children,
    style,
    onPress,
    onPressIn,
    onPressOut,
    disabled,
    accessibilityLabel,
  }: {
    children: import("react").ReactNode;
    style: unknown;
    onPress: () => void;
    onPressIn?: () => void;
    onPressOut?: () => void;
    disabled?: boolean;
    accessibilityLabel: string;
  }) => {
    const raw = typeof style === "function" ? style({ pressed: false }) : style;
    const flattened = Object.assign(
      {},
      ...(Array.isArray(raw) ? raw.flat().filter(Boolean) : [raw]),
    );
    return createElement(
      "button",
      {
        "aria-label": accessibilityLabel,
        "data-scale": flattened.transform?.[0]?.scale,
        "data-width": flattened.width ?? flattened.minWidth,
        "data-height": flattened.height ?? flattened.minHeight,
        disabled,
        onClick: onPress,
        onPointerDown: onPressIn,
        onPointerUp: onPressOut,
      },
      children,
    );
  },
}));
import { ChatCircleAction, ChatToolbarAction, ChatSummary } from "./chat-controls";
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
async function render(component: import("react").ReactNode) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (!root) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => root!.render(component));
}
async function press() {
  await act(async () => {
    container.querySelector("button")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    container.querySelector("button")!.dispatchEvent(new Event("pointerup", { bubbles: true }));
  });
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  state.reduced = false;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it.each([ChatCircleAction, ChatToolbarAction])(
  "subtle feedback preserves the 48dp action and stops spatial feedback on live reduced-motion changes",
  async (Component) => {
    await render(createElement(Component, { label: "Action", onPress: state.action }));
    expect(state.motion).toHaveBeenCalledWith(0.97);
    expect(container.querySelector("button")!.dataset.height).toBe("48");
    expect(container.querySelector("button")!.dataset.width).toBe("48");
    expect(container.querySelector("button")!.dataset.scale).toBeUndefined();
    expect(
      container.querySelector("[data-animated-scale]")?.getAttribute("data-animated-scale"),
    ).toBe("0.97");
    await press();
    expect(state.pressIn).toHaveBeenCalledTimes(1);
    state.reduced = true;
    await render(createElement(Component, { label: "Action", onPress: state.action }));
    expect(container.querySelector("button")!.dataset.scale).toBeUndefined();
    expect(container.querySelector("[data-animated-scale]")).toBeNull();
    await press();
    expect(state.pressIn).toHaveBeenCalledTimes(1);
    expect(state.pressOut).toHaveBeenCalled();
    await act(async () => container.querySelector("button")!.click());
    expect(state.action).toHaveBeenCalledTimes(1);
  },
);
it("busy actions never scale or dispatch and essential summary identity/status have no line cap", async () => {
  await render(
    createElement(ChatToolbarAction, { label: "Busy", busy: true, onPress: state.action }),
  );
  expect(container.querySelector("button")!.disabled).toBe(true);
  expect(container.querySelector("button")!.dataset.scale).toBeUndefined();
  await act(async () => container.querySelector("button")!.click());
  expect(state.action).not.toHaveBeenCalled();
  const label = "src/features/workspace/a-very-long-identity/session-composer-delivery.tsx";
  await render(
    createElement(ChatSummary, {
      label,
      detail: "Open change",
      status: "Waiting for a very long provider operation",
      icon: null,
      onPress: state.action,
    }),
  );
  const spans = container.querySelectorAll("span");
  expect(spans[0].textContent).toBe(label);
  expect(spans[0].getAttribute("data-lines")).toBeNull();
  expect(spans[2].getAttribute("data-lines")).toBeNull();
});
