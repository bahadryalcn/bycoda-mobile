import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sliderPositionCount, snapSliderValue } from "./slider-field-model";

const state = vi.hoisted(() => ({
  slider: undefined as undefined | Record<string, any>,
  draft: undefined as undefined | number,
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: <T,>(initial: T) => [state.draft ?? initial, (next: T) => { state.draft = next as number; }] };
});
vi.mock("react-native", () => ({
  View: ({ children, style }: PropsWithChildren<{ style?: unknown }>) =>
    createElement("div", { "data-style": JSON.stringify(style) }, children),
}));
vi.mock("./theme", () => ({
  useMobileTheme: () => ({ colors: { accent: "#0af" }, uiStyles: { fieldLabel: {}, caption: {} } }),
}));
vi.mock("./typography", () => ({
  Body: ({ children }: PropsWithChildren) => createElement("span", null, children),
}));
vi.mock("panelui-native/components/slider", () => ({
  Slider: (props: Record<string, any>) => {
    state.slider = props;
    return createElement("div", { "data-slider": props.label });
  },
}));
import { SliderField } from "./slider-field";

beforeEach(() => { state.slider = undefined; state.draft = undefined; });

describe("slider value snapping", () => {
  it("clamps and snaps without float noise", () => {
    expect(snapSliderValue(1.1500000000000001, 0.85, 1.3, 0.05)).toBe(1.15);
    expect(snapSliderValue(0.9, 0.85, 1.3, 0.05)).toBe(0.9);
    expect(snapSliderValue(5, 0.85, 1.3, 0.05)).toBe(1.3);
    expect(snapSliderValue(-1, 0.85, 1.3, 0.05)).toBe(0.85);
    expect(snapSliderValue(Number.NaN, 1, 1.5, 0.05)).toBe(1);
    expect(snapSliderValue(7, 5, 5, 1)).toBe(5);
  });
  it("counts positions on a stepped track", () => {
    expect(sliderPositionCount(0.85, 1.3, 0.05)).toBe(10);
    expect(sliderPositionCount(1, 1.5, 0.05)).toBe(11);
    expect(sliderPositionCount(3, 3, 1)).toBe(1);
  });
});

describe("SliderField", () => {
  const base = { label: "Text size", min: 0.85, max: 1.3, step: 0.05, formatValue: (n: number) => `${Math.round(n * 100)}%` };
  it("shows the label and formatted value, and names the thumb", () => {
    const html = renderToStaticMarkup(createElement(SliderField, { ...base, value: 1, onCommit: vi.fn(), lowLabel: "Smaller", highLabel: "Larger" }));
    expect(html).toContain("Text size");
    expect(html).toContain("100%");
    expect(html).toContain("Smaller");
    expect(html).toContain("Larger");
    expect(state.slider).toMatchObject({ label: "Text size", min: 0.85, max: 1.3, step: 0.05, value: 1 });
    expect(state.slider!.headerClassName).toBe("hidden");
    expect(state.slider!.formatValue(1.15)).toBe("115%");
  });
  it("reserves a 48dp touch row", () => {
    const html = renderToStaticMarkup(createElement(SliderField, { ...base, value: 1, onCommit: vi.fn() }));
    expect(html).toContain("&quot;minHeight&quot;:48");
  });
  it("commits once, and only for a changed snapped value", () => {
    const onCommit = vi.fn();
    const onChange = vi.fn();
    renderToStaticMarkup(createElement(SliderField, { ...base, value: 1, onCommit, onChange }));
    state.slider!.onValueChange(1.1500000000000001);
    expect(onChange).toHaveBeenCalledWith(1.15);
    expect(onCommit).not.toHaveBeenCalled();
    state.slider!.onValueCommit(1.1500000000000001);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(1.15);
    state.slider!.onValueCommit(1.0000000001);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
  it("follows the finger while dragging and returns to the owner's value afterwards", () => {
    renderToStaticMarkup(createElement(SliderField, { ...base, value: 1, onCommit: vi.fn() }));
    state.slider!.onValueChange(1.25);
    expect(state.draft).toBe(1.25);
    state.slider!.onValueCommit(1.25);
    expect(state.draft).toBeUndefined();
  });
  it("passes the disabled state to the track", () => {
    renderToStaticMarkup(createElement(SliderField, { ...base, value: 1, onCommit: vi.fn(), disabled: true }));
    expect(state.slider!.disabled).toBe(true);
  });
  it("snaps an out-of-range owner value into the track", () => {
    const html = renderToStaticMarkup(createElement(SliderField, { ...base, value: 9, onCommit: vi.fn() }));
    expect(html).toContain("130%");
    expect(state.slider!.value).toBe(1.3);
  });
});
