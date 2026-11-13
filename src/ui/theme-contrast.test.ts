import { describe, expect, it } from "vitest";
import { PALETTE_IDS, resolveMobilePalette } from "./tokens";

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

function composite(tint: string, background: string) {
  const alpha = parseInt(tint.slice(7, 9), 16) / 255;
  return "#" + [1, 3, 5].map(offset => Math.round(
    parseInt(tint.slice(offset, offset + 2), 16) * alpha +
    parseInt(background.slice(offset, offset + 2), 16) * (1 - alpha),
  ).toString(16).padStart(2, "0")).join("");
}

const cases = PALETTE_IDS.flatMap((palette) => (["light", "dark"] as const).map((mode) => [palette, mode] as const));
describe.each(cases)("mobile %s %s reading contrast", (palette, mode) => {
  const { colors, semantic: semanticColors } = resolveMobilePalette(palette, mode);
  it("keeps navigation labels readable over both bright and dark scene content", () => {
    for (const backdrop of ["#000000", "#FFFFFF"]) {
      const background = composite(colors.glass, backdrop);
      for (const foreground of [colors.text, colors.muted, colors.accent])
        expect(contrast(foreground, background), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("keeps small body, metadata and action text readable on every workbench surface", () => {
    for (const background of [
      colors.background,
      colors.panel,
      colors.raised,
      colors.selected,
      colors.userMessage,
      colors.elevated,
      colors.fill,
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
