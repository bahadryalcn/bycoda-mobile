// @vitest-environment happy-dom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { TimeFieldTrigger } from "./time-field-trigger";
import { opacity } from "./tokens";

const state = vi.hoisted(() => ({ reducedMotion: true, trigger: {} as any }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("./use-reduced-motion", () => ({ useReducedMotionPreference: () => state.reducedMotion }));
vi.mock("./info-hint", () => ({ HintLabel: ({ label }: any) => h("label", null, label) }));
vi.mock("./typography", () => ({ Body: ({ children }: any) => h("span", null, children) }));
vi.mock("lucide-react-native/icons/clock", () => ({ default: () => null }));
vi.mock("react-native", () => ({ View: ({ children }: any) => h("div", null, children) }));
vi.mock("panelui-native/components/input-group", () => ({
  InputGroup: ({ children, isDisabled }: any) => h("div", { "data-input-group-disabled": !!isDisabled }, children),
}));
vi.mock("panelui-native/primitives/animated-pressable", () => ({
  AnimatedPressable: (props: any) => {
    state.trigger = props;
    return h("button", { disabled: props.disabled, "aria-label": props.accessibilityLabel, onClick: props.onPress }, props.children);
  },
}));

it("keeps time value, button semantics, 48dp growth, disabled state and reduced motion", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container), onPress = vi.fn();
  try {
    act(() => root.render(h(TimeFieldTrigger, { label: "Time", value: "23:59", onPress })));
    expect(container.querySelector("button")!.getAttribute("aria-label")).toBe("Time: 23:59");
    expect(container.textContent).toContain("23:59");
    expect(state.trigger.accessibilityRole).toBe("button");
    expect(state.trigger.style[2].minHeight).toBeGreaterThanOrEqual(48);
    expect(state.trigger.style[2].height).toBeUndefined();
    expect(state.trigger.pressScale).toBe(1);
    expect(state.trigger.pressOpacity).toBe(1);
    act(() => container.querySelector("button")!.click());
    expect(onPress).toHaveBeenCalledOnce();
    act(() => root.render(h(TimeFieldTrigger, { label: "Time", value: "23:59", disabled: true, onPress })));
    expect(state.trigger.accessibilityState).toEqual({ disabled: true });
    expect(container.querySelector('[data-input-group-disabled="true"]')).not.toBeNull();
    act(() => container.querySelector("button")!.click());
    expect(onPress).toHaveBeenCalledOnce();
    state.reducedMotion = false;
    act(() => root.render(h(TimeFieldTrigger, { label: "Time", value: "08:00", onPress })));
    expect(state.trigger.pressOpacity).toBe(opacity.pressed);
    expect(container.textContent).toContain("08:00");
  } finally {
    state.reducedMotion = true;
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
