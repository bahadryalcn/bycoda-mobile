import { describe, expect, it } from "vitest";
import { DEFAULT_TYPOGRAPHY, normalizeTypography } from "@/ui/typography-preferences";
import {
  LINE_SPACING_RANGE,
  TEXT_SCALE_RANGE,
  appearanceSummary,
  fontFamilyOptions,
  fontWeightOptions,
  formatPercent,
  isDefaultTypography,
  themeModeOptions,
} from "./appearance-settings-model";

const copy = (_tr: string, en: string) => en;

describe("appearance settings model", () => {
  it("keeps the slider ranges the typography contract allows", () => {
    expect(TEXT_SCALE_RANGE).toEqual({ min: 0.85, max: 1.3, step: 0.05 });
    expect(LINE_SPACING_RANGE).toEqual({ min: 1, max: 1.5, step: 0.05 });
    // Every slider extreme and step is a value the store keeps unchanged.
    for (const [key, range] of [["scale", TEXT_SCALE_RANGE], ["lineSpacing", LINE_SPACING_RANGE]] as const)
      for (const value of [range.min, range.min + range.step, range.max])
        expect(normalizeTypography({ [key]: value })[key]).toBeCloseTo(value, 9);
    expect(normalizeTypography({ scale: 9 }).scale).toBe(TEXT_SCALE_RANGE.max);
  });
  it("formats whole percents without float noise", () => {
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(1.1500000000000001)).toBe("115%");
    expect(formatPercent(0.85)).toBe("85%");
  });
  it("offers every stored value exactly once", () => {
    expect(themeModeOptions(copy).map((o) => o.value)).toEqual(["system", "light", "dark"]);
    expect(fontFamilyOptions(copy).map((o) => o.value)).toEqual(["system", "sans", "serif", "mono"]);
    expect(fontWeightOptions(copy).map((o) => o.value)).toEqual(["regular", "medium", "bold"]);
  });
  it("detects defaults only when all four typography values match", () => {
    expect(isDefaultTypography(DEFAULT_TYPOGRAPHY)).toBe(true);
    expect(isDefaultTypography({ ...DEFAULT_TYPOGRAPHY, scale: 1.05 })).toBe(false);
    expect(isDefaultTypography({ ...DEFAULT_TYPOGRAPHY, lineSpacing: 1.1 })).toBe(false);
    expect(isDefaultTypography({ ...DEFAULT_TYPOGRAPHY, fontFamily: "serif" })).toBe(false);
    expect(isDefaultTypography({ ...DEFAULT_TYPOGRAPHY, weight: "bold" })).toBe(false);
    expect(isDefaultTypography({ ...DEFAULT_TYPOGRAPHY, scale: 1 + 1e-12 })).toBe(true);
  });
  it("summarizes theme and palette, adding the scale only when changed", () => {
    expect(appearanceSummary({ theme: "Dark", palette: "Classic", scale: 1 })).toBe("Dark, Classic");
    expect(appearanceSummary({ theme: "Dark", palette: "Classic", scale: 1.15 })).toBe("Dark, Classic, 115%");
  });
});
