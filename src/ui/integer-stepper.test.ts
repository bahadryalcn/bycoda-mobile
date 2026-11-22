// @vitest-environment jsdom
import { act, createElement, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

type PressHandlers = {
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onPressOut: () => void;
  style: { minWidth: number; minHeight: number };
};
const controls = vi.hoisted(() => new Map<string, PressHandlers>());
vi.mock("react-native", () => ({
  StyleSheet: { hairlineWidth: 1 },
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
}));
vi.mock("lucide-react-native/icons/minus", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("panelui-native/primitives/animated-pressable", () => ({
  AnimatedPressable: (props: PressHandlers) => {
    controls.set(props.accessibilityLabel, props);
    return createElement("button", {
      "aria-label": props.accessibilityLabel, disabled: props.disabled, onClick: props.onPress,
    });
  },
}));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("./copy", () => ({
  useCopy: () => (_tr: string, en: string, values: { p0: string }) => en.replace("{p0}", values.p0),
}));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("./info-hint", () => ({ HintLabel: ({ label }: { label: string }) => label }));
vi.mock("./typography", () => ({
  Body: ({ children, accessibilityLabel }: PropsWithChildren<{ accessibilityLabel: string }>) =>
    createElement("output", { "aria-label": accessibilityLabel }, children),
}));

import { IntegerStepper } from "./integer-stepper";

let root: ReturnType<typeof createRoot> | undefined;
let node: HTMLElement;
function Example({ disabled }: { disabled?: boolean }) {
  const [value, setValue] = useState(2);
  return createElement(IntegerStepper, { label: "Task limit", value, min: 1, max: 6, onValueChange: setValue, disabled });
}

function render(disabled?: boolean) {
  if (!root) {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    node = document.createElement("div");
    root = createRoot(node);
  }
  act(() => root!.render(createElement(Example, { disabled })));
}

const increase = () => controls.get("Increase Task limit")!;
const decrease = () => controls.get("Decrease Task limit")!;
const value = () => node.querySelector("output")?.value;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  controls.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("uses labeled 48dp buttons, changes by one, and stops at the minimum without a keyboard", () => {
  render();
  expect(node.querySelector("input")).toBeNull();
  expect(increase().style).toMatchObject({ minWidth: 48, minHeight: 48 });
  expect(decrease().style).toMatchObject({ minWidth: 48, minHeight: 48 });
  act(() => node.querySelector<HTMLButtonElement>('button[aria-label="Decrease Task limit"]')!.click());
  expect(value()).toBe("1");
  expect(decrease().disabled).toBe(true);
});

it("repeats on hold, stops on release and never exceeds the maximum", () => {
  vi.useFakeTimers();
  render();
  act(() => { increase().onLongPress(); vi.advanceTimersByTime(90); });
  expect(value()).toBe("4");
  act(() => { increase().onPressOut(); vi.advanceTimersByTime(500); });
  expect(value()).toBe("4");
  act(() => { increase().onLongPress(); vi.advanceTimersByTime(500); });
  expect(value()).toBe("6");
  expect(increase().disabled).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("reads a text draft inside the range and starts unreadable text from the lower bound", async () => {
  const { stepperValue } = await import("./integer-stepper");
  expect(stepperValue("7", 1, 10)).toBe(7);
  expect(stepperValue("99", 1, 10)).toBe(10);
  expect(stepperValue("-4", 1, 10)).toBe(1);
  expect(stepperValue("", 1, 10)).toBe(1);
  expect(stepperValue("abc", 1, 10)).toBe(1);
  expect(stepperValue("2.5", 1, 10)).toBe(1);
});

it("cancels a hold when the setting becomes unavailable", () => {
  vi.useFakeTimers();
  render();
  act(() => increase().onLongPress());
  expect(value()).toBe("3");
  render(true);
  act(() => vi.advanceTimersByTime(1000));
  expect(value()).toBe("3");
  expect(increase().disabled).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
