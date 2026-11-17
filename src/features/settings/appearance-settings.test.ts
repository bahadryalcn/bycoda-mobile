import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  themeMode: "dark",
  palette: "classic",
  hydrated: true,
  storageError: null as Error | null,
  setThemeMode: vi.fn(() => Promise.resolve()),
  setPalette: vi.fn(() => Promise.resolve()),
  navigationStyle: "floating",
  setNavigationStyle: vi.fn(() => Promise.resolve()),
  retryStorage: vi.fn((_error: Error) => Promise.resolve()),
  segmented: undefined as undefined | Record<string, any>,
  palettePicker: undefined as undefined | Record<string, any>,
  notice: undefined as undefined | Record<string, any>,
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/tokens", () => ({ space: { md: 12, xl: 20 } }));
vi.mock("@/state/actions", () => ({ useAsyncAction: () => ({ isPending: false, run: (work: () => Promise<void>) => work() }) }));
vi.mock("@/state/appearance", () => ({
  useAppearance: (select: (s: unknown) => unknown) =>
    select({
      themeMode: state.themeMode,
      palette: state.palette,
      hydrated: state.hydrated,
      storageError: state.storageError,
      setThemeMode: state.setThemeMode,
      setPalette: state.setPalette,
      retryStorage: state.retryStorage,
    }),
}));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Stack: Wrap,
    Section: ({ title, children }: PropsWithChildren<{ title: string }>) => createElement("section", { "aria-label": title }, children),
    SegmentedControl: (props: Record<string, any>) => { state.segmented = props; return null; },
    Notice: (props: Record<string, any>) => { state.notice = props; return createElement("aside", null, props.message); },
  };
});
vi.mock("./palette-picker", () => ({ PalettePicker: (props: Record<string, any>) => { state.palettePicker = props; return createElement("div", { "data-owner": "palette" }); } }));
vi.mock("./typography-settings", () => ({ TypographySettings: () => createElement("div", { "data-owner": "typography" }) }));
vi.mock("./chat-appearance-settings", () => ({ ChatAppearanceSettings: () => createElement("div", { "data-owner": "chat" }) }));
vi.mock("./appearance-preview", () => ({ AppearancePreview: () => createElement("div", { "data-owner": "preview" }) }));
import { AppearanceSettings } from "./appearance-settings";

beforeEach(() => {
  state.hydrated = true;
  state.storageError = null;
  state.notice = undefined;
  state.setThemeMode.mockClear();
  state.setPalette.mockClear();
  state.retryStorage.mockClear();
});

it("puts theme, palette, typography, message size and preview on one page in order", () => {
  const html = renderToStaticMarkup(createElement(AppearanceSettings));
  const order = ["aria-label=\"Theme\"", 'data-owner="palette"', 'data-owner="typography"', 'data-owner="chat"', 'data-owner="preview"'];
  const at = order.map((part) => html.indexOf(part));
  expect(at.every((index) => index >= 0)).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
});
it("keeps System, Light and Dark and persists choices", () => {
  renderToStaticMarkup(createElement(AppearanceSettings));
  expect(state.segmented!.options.map((o: { value: string }) => o.value)).toEqual(["system", "light", "dark"]);
  expect(state.segmented).toMatchObject({ value: "dark", hideLabel: true, disabled: false });
  state.segmented!.onChange("light");
  expect(state.setThemeMode).toHaveBeenCalledWith("light");
  state.palettePicker!.onChange("tide");
  expect(state.setPalette).toHaveBeenCalledWith("tide");
});
it("blocks theme and palette until the appearance record is read", () => {
  state.hydrated = false;
  renderToStaticMarkup(createElement(AppearanceSettings));
  expect(state.segmented!.disabled).toBe(true);
  expect(state.palettePicker!.disabled).toBe(true);
});
it("shows recovery for a failed read or save and retries through the store with the captured error", () => {
  expect(renderToStaticMarkup(createElement(AppearanceSettings))).not.toContain("<aside");
  const error = new Error("Appearance could not be loaded.");
  state.storageError = error;
  const html = renderToStaticMarkup(createElement(AppearanceSettings));
  expect(html).toContain("could not be read or saved");
  expect(state.notice).toMatchObject({ tone: "warning", retrying: false });
  state.notice!.onRetry();
  expect(state.retryStorage).toHaveBeenCalledWith(error);
  // A retry must never write the current (possibly default) theme over an unread saved record.
  expect(state.setThemeMode).not.toHaveBeenCalled();
  expect(state.setPalette).not.toHaveBeenCalled();
});
