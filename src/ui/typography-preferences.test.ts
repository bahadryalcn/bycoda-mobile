import { describe, expect, it } from "vitest";
import { DEFAULT_TYPOGRAPHY, normalizeTypography } from "./typography-preferences";

describe("typography normalization", () => {
  it.each([null, [], "bad", undefined])("migrates absent or invalid preferences: %s", (value) => {
    expect(normalizeTypography(value)).toEqual(DEFAULT_TYPOGRAPHY);
  });
  it("bounds sliders and rejects unsupported font choices", () => {
    expect(normalizeTypography({ scale: 9, lineSpacing: -3, fontFamily: "download", weight: "thin" }))
      .toEqual({ ...DEFAULT_TYPOGRAPHY, scale: 1.3 });
    expect(normalizeTypography({ scale: NaN, lineSpacing: Infinity })).toEqual(DEFAULT_TYPOGRAPHY);
    expect(normalizeTypography({ scale: 1.124, lineSpacing: 1.127, fontFamily: "serif", weight: "medium" }))
      .toEqual({ scale: 1.1, lineSpacing: 1.15, fontFamily: "serif", weight: "medium" });
  });
});
