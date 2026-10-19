import { describe, expect, it } from "vitest";
import { themePalettes, semanticPalettes } from "./tokens";

function luminance(hex: string) {
  const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = rgb.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

describe.each(["light", "dark"] as const)("mobile %s reading contrast", (mode) => {
  const colors = themePalettes[mode];
  const semanticColors = semanticPalettes[mode];
  it("keeps small body, metadata and action text readable on every workbench surface", () => {
    for (const background of [
      colors.background,
      colors.panel,
      colors.raised,
      colors.selected,
      colors.userMessage,
      colors.elevated,
    ]) {
      for (const foreground of [colors.text, colors.muted, colors.subtle, colors.accent]) {
        expect(
          contrast(foreground, background),
          `${foreground} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it("preserves readable primary actions and semantic feedback", () => {
    expect(contrast(colors.primaryText, colors.accentSolid)).toBeGreaterThanOrEqual(4.5);
    for (const tone of Object.values(semanticColors)) {
      expect(contrast(tone.text, tone.surface)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
