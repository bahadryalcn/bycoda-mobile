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
vi.mock("./theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
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
vi.mock("./busy-indicator", () => ({ LifecycleButton: ({ children, startContent, loading, disabled, accessibilityLabel, onPress, style, pressScale }: any) => createElement("button", { "aria-label": accessibilityLabel, "data-width": style.width ?? style.minWidth, "data-height": style.height ?? style.minHeight, "data-press-scale": pressScale, disabled: disabled || loading, onClick: onPress }, loading ? null : startContent, children) }));
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
it("keeps the same accessible toolbar target and callback when its visible label is compacted", async () => {
  const props = { label: "Messages", accessibilityLabel: "Chat view: Messages", onPress: state.action };
  await render(createElement(ChatToolbarAction, props, createElement("span", { "data-icon": true })));
  const trigger = container.querySelector("button")!;
  expect(trigger.textContent).toBe("Messages");
  await render(createElement(ChatToolbarAction, { ...props, hideLabel: true }, createElement("span", { "data-icon": true })));
  expect(container.querySelector("button")).toBe(trigger);
  expect(trigger.getAttribute("aria-label")).toBe("Chat view: Messages");
  expect(trigger.textContent).toBe("");
  expect(trigger.querySelector("[data-icon]")).not.toBeNull();
  expect(trigger.dataset.width).toBe("28");
  expect(trigger.dataset.height).toBe("28");
  await act(async () => trigger.click());
  expect(state.action).toHaveBeenCalledTimes(1);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  state.reduced = false;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it.each([ChatCircleAction, ChatToolbarAction])(
  "subtle feedback keeps a compact visual with a 48dp hit slop and and stops spatial feedback on live reduced-motion changes",
  async (Component) => {
    await render(createElement(Component, { label: "Action", onPress: state.action }));
    const visual = Component === ChatCircleAction ? "32" : "28";
    expect(container.querySelector("button")!.dataset.height).toBe(visual);
    expect(container.querySelector("button")!.dataset.width).toBe(visual);
    expect(container.querySelector("button")!.dataset.pressScale).toBe("0.97");
    state.reduced = true;
    await render(createElement(Component, { label: "Action", onPress: state.action }));
    expect(container.querySelector("button")!.dataset.pressScale).toBe("1");
    await act(async () => container.querySelector("button")!.click());
    expect(state.action).toHaveBeenCalledTimes(1);
  },
);
it("busy actions never dispatch and one-line summaries retain full accessible identity/status", async () => {
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
  expect(spans[0].getAttribute("data-lines")).toBe("1");
  expect(spans[2].getAttribute("data-lines")).toBe("1");
  expect(container.querySelector("button")!.getAttribute("aria-label"))
    .toBe(`${label}. Open change. Waiting for a very long provider operation`);
});

it("shows handoff summaries as prose while opening the original details", async () => {
  await render(createElement(ChatSummary, {
    label: "Agent handoff", detail: "## Session so far\n\n**User:** Fix [OAuth](https://example.com)",
    icon: null, onPress: state.action,
  }));
  expect(container.textContent).toBe("Agent handoffSession so far User: Fix OAuth");
  await act(async () => container.querySelector("button")!.click());
  expect(state.action).toHaveBeenCalledOnce();
});
