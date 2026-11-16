import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  typography: { scale: 1, fontFamily: "system", weight: "regular", lineSpacing: 1 } as Record<string, unknown>,
  hydrated: true,
  setTypography: vi.fn(),
  resetTypography: vi.fn(),
  sliders: [] as Record<string, any>[],
  select: undefined as undefined | Record<string, any>,
  segmented: undefined as undefined | Record<string, any>,
  button: undefined as undefined | Record<string, any>,
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/state/appearance", () => ({
  useAppearance: (select: (s: unknown) => unknown) =>
    select({
      typography: state.typography,
      hydrated: state.hydrated,
      setTypography: state.setTypography,
      resetTypography: state.resetTypography,
    }),
}));
vi.mock("@/ui/slider-field", () => ({
  SliderField: (props: Record<string, any>) => { state.sliders.push(props); return null; },
}));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Stack: Wrap,
    Section: ({ title, children }: PropsWithChildren<{ title: string }>) => createElement("section", { "aria-label": title }, children),
    SelectField: (props: Record<string, any>) => { state.select = props; return null; },
    SegmentedControl: (props: Record<string, any>) => { state.segmented = props; return null; },
    Button: (props: Record<string, any>) => { state.button = props; return null; },
  };
});
import { TypographySettings } from "./typography-settings";

beforeEach(() => {
  state.typography = { scale: 1, fontFamily: "system", weight: "regular", lineSpacing: 1 };
  state.hydrated = true;
  state.sliders = [];
  state.setTypography.mockReset();
  state.resetTypography.mockReset();
});
const render = () => renderToStaticMarkup(createElement(TypographySettings));
const slider = (label: string) => state.sliders.find((s) => s.label === label)!;

it("exposes text size and line spacing as sliders over the contract ranges", () => {
  render();
  expect(slider("Text size")).toMatchObject({ min: 0.85, max: 1.3, step: 0.05, value: 1 });
  expect(slider("Line spacing")).toMatchObject({ min: 1, max: 1.5, step: 0.05, value: 1 });
  expect(slider("Text size").formatValue(1.15)).toBe("115%");
});
it("persists one field per commit", () => {
  render();
  slider("Text size").onCommit(1.2);
  expect(state.setTypography).toHaveBeenLastCalledWith({ scale: 1.2 });
  slider("Line spacing").onCommit(1.3);
  expect(state.setTypography).toHaveBeenLastCalledWith({ lineSpacing: 1.3 });
  state.select!.onChange("serif");
  expect(state.setTypography).toHaveBeenLastCalledWith({ fontFamily: "serif" });
  state.segmented!.onChange("bold");
  expect(state.setTypography).toHaveBeenLastCalledWith({ weight: "bold" });
  expect(state.setTypography).toHaveBeenCalledTimes(4);
});
it("disables every control until the appearance record is read", () => {
  state.hydrated = false;
  state.typography = { scale: 1.2, fontFamily: "serif", weight: "bold", lineSpacing: 1.2 };
  render();
  expect(state.sliders.every((s) => s.disabled)).toBe(true);
  expect(state.select!.disabled).toBe(true);
  expect(state.segmented!.disabled).toBe(true);
  expect(state.button!.disabled).toBe(true);
});
it("offers reset only when something differs, and resets just typography", () => {
  render();
  expect(state.button!.disabled).toBe(true);
  state.typography = { ...state.typography, scale: 1.1 };
  render();
  expect(state.button!.disabled).toBe(false);
  state.button!.onPress();
  expect(state.resetTypography).toHaveBeenCalledTimes(1);
  expect(state.setTypography).not.toHaveBeenCalled();
});
