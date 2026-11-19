import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  os: "android" as "android" | "ios",
  version: 34,
}));

vi.mock("react-native", () => ({
  PlatformColor: (token: string) => token,
  Platform: {
    get OS() {
      return state.os;
    },
    get Version() {
      return state.version;
    },
  },
  View: ({ children, testID }: PropsWithChildren<{ testID?: string }>) =>
    createElement("div", { "data-testid": testID }, children),
}));
vi.mock("@/ui/primitives", () => ({
  Stack: ({ children }: PropsWithChildren) => createElement("div", null, children),
  Body: ({ children }: PropsWithChildren) => createElement("span", null, children),
  PressableCard: ({ children, label }: PropsWithChildren<{ label: string }>) =>
    createElement("button", { "data-testid": "palette-card", "aria-label": label }, children),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({
  useMobileTheme: () => ({
    mode: "dark",
    colors: { accent: "accent", border: "border", selected: "selected", panel: "panel" },
  }),
}));
vi.mock("@/ui/tokens", () => ({
  DEFAULT_PALETTE: "classic",
  PALETTES: [
    ...["classic", "bycoda", "dusk", "ink", "kiln", "olive", "rose", "sand", "tide"].map((id, index) =>
      ({ id, name: `Palette ${index}`, nameTr: `Palet ${index}` })),
    { id: "material", name: "Material You", nameTr: "Material You", dynamic: true },
  ],
  metrics: { touchTarget: 48 },
  radii: { card: 12, badge: 6 },
  space: { sm: 4, md: 8 },
  resolveMobilePalette: () => ({ colors: { background: "#000", panel: "#111", border: "#222", accent: "#333" } }),
}));
vi.mock("@/ui/palettes", () => ({
  materialYouAvailable: (os: string, version: number) => os === "android" && version >= 31,
}));

const { PalettePicker } = await import("./palette-picker");

function renderPicker() {
  return renderToStaticMarkup(createElement(PalettePicker, { value: "classic", onChange: () => {} }));
}

function countMarkers(markup: string, marker: string) {
  return markup.split(marker).length - 1;
}

beforeEach(() => {
  state.os = "android";
  state.version = 34;
});

it("pads a short last row with invisible spacers so every card keeps one column width", () => {
  // Android 12+ shows ten palettes: rows of 3, 3, 3 and 1. The last row needs two spacers.
  const markup = renderPicker();

  expect(countMarkers(markup, 'data-testid="palette-card"')).toBe(10);
  expect(countMarkers(markup, 'data-testid="palette-picker-spacer"')).toBe(2);
  // Spacers sit after the lone last card, inside its row, not in front of it.
  const lastCardAt = markup.lastIndexOf('data-testid="palette-card"');
  const firstSpacerAt = markup.indexOf('data-testid="palette-picker-spacer"');
  expect(firstSpacerAt).toBeGreaterThan(lastCardAt);
});

it("adds no spacers when the palette count fills complete rows", () => {
  // iOS and older Android show nine palettes, an even three-by-three grid.
  state.os = "ios";
  state.version = 17;
  const markup = renderPicker();

  expect(countMarkers(markup, 'data-testid="palette-card"')).toBe(9);
  expect(countMarkers(markup, 'data-testid="palette-picker-spacer"')).toBe(0);
});
