import { describe, expect, it } from "vitest";

import type { MaterialYouSwatches } from "./palettes.ts";
import { isMaterialYouRefreshDue, swatchSetChanged, type SwatchSet } from "./theme-material-you-model.ts";

const light: MaterialYouSwatches = {
  primary: "#3366FF",
  onPrimary: "#FFFFFF",
  primaryContainer: "#DDE5FF",
  onPrimaryContainer: "#001A41",
  surface: "#FAF9FD",
  surfaceVariant: "#E1E2EC",
  onSurface: "#1A1B20",
  onSurfaceVariant: "#44474F",
};
const dark: MaterialYouSwatches = { ...light, primary: "#B4C5FF", surface: "#121316", onSurface: "#E3E2E6" };
const set: SwatchSet = { light, dark };

describe("isMaterialYouRefreshDue", () => {
  it("refreshes only the Material You palette on Android while active", () => {
    expect(isMaterialYouRefreshDue("material", "android", "active")).toBe(true);
  });

  it("ignores other palettes, other platforms and background transitions", () => {
    expect(isMaterialYouRefreshDue("classic", "android", "active")).toBe(false);
    expect(isMaterialYouRefreshDue("material", "ios", "active")).toBe(false);
    expect(isMaterialYouRefreshDue("material", "android", "background")).toBe(false);
  });
});

describe("swatchSetChanged", () => {
  it("reports no change for identical readings", () => {
    expect(swatchSetChanged(set, { light: { ...light }, dark: { ...dark } })).toBe(false);
  });

  it("reports a change when either mode differs", () => {
    expect(swatchSetChanged(set, { light: { ...light, primary: "#00AA00" }, dark })).toBe(true);
    expect(swatchSetChanged(set, { light, dark: { ...dark, surface: "#000000" } })).toBe(true);
  });

  it("treats a first reading as a change, but ignores readings without swatches", () => {
    expect(swatchSetChanged(null, set)).toBe(true);
    expect(swatchSetChanged(set, { light: null, dark: null })).toBe(false);
    expect(swatchSetChanged(null, { light: null, dark: null })).toBe(false);
  });
});
