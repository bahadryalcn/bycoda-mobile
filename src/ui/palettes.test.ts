import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MATERIAL_YOU_MIN_API,
  contrastRatio,
  PALETTE_IDS,
  PALETTES,
  derivePaletteColors,
  hslToHex,
  materialYouAvailable,
  materialYouColors,
  STATUS_HUES,
  mixHex,
  normalizePalette,
  statusInk,
  uniwindThemeName,
  type MaterialYouSwatches,
} from "./palettes";
import { darkColors, lightColors, resolveMobilePalette, semanticPalettes } from "./tokens";

// Material 3 baseline roles (light and dark), used as a stand-in for an Android system palette.
const M3_LIGHT: MaterialYouSwatches = {
  primary: "#6750A4", onPrimary: "#FFFFFF", primaryContainer: "#EADDFF", onPrimaryContainer: "#21005D",
  surface: "#FFFBFE", surfaceVariant: "#E7E0EC", onSurface: "#1C1B1F", onSurfaceVariant: "#49454F",
};
const M3_DARK: MaterialYouSwatches = {
  primary: "#D0BCFF", onPrimary: "#381E72", primaryContainer: "#4F378B", onPrimaryContainer: "#EADDFF",
  surface: "#1C1B1F", surfaceVariant: "#49454F", onSurface: "#E6E1E5", onSurfaceVariant: "#CAC4D0",
};
const DYNAMIC_IDS = PALETTES.filter((item) => item.dynamic).map((item) => item.id);
const HUE_IDS = PALETTE_IDS.filter((item) => item !== "classic" && !DYNAMIC_IDS.includes(item));

function contrastOn(foreground: string, background: string) {
  const linear = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((offset) => {
      const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
  };
  const [high, low] = [linear(foreground), linear(background)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

describe("hslToHex", () => {
  it.each([
    [0, 0, 0, "#000000"],
    [0, 0, 100, "#FFFFFF"],
    [0, 100, 50, "#FF0000"],
    [120, 100, 50, "#00FF00"],
    [240, 100, 50, "#0000FF"],
    [216, 0, 50, "#808080"],
    [360, 100, 50, "#FF0000"],
    [-120, 100, 50, "#0000FF"],
  ])("converts hsl(%i %i%% %i%%)", (h, s, l, hex) => expect(hslToHex(h, s, l)).toBe(hex));
  it("clamps out-of-range saturation and lightness", () => {
    expect(hslToHex(10, 500, 150)).toBe("#FFFFFF");
    expect(hslToHex(10, -5, -5)).toBe("#000000");
  });
});

describe("palette resolution", () => {
  it("offers unique persisted palette choices, Material You last", () => {
    expect(PALETTES).toHaveLength(10);
    expect(new Set(PALETTE_IDS).size).toBe(10);
    expect(PALETTES.map(palette => palette.id)).toEqual([...PALETTE_IDS]);
    expect(PALETTE_IDS.at(-1)).toBe("material");
  });
  it("shows Material You only on Android 12 (API 31) and newer", () => {
    expect(MATERIAL_YOU_MIN_API).toBe(31);
    expect(materialYouAvailable("android", 31)).toBe(true);
    expect(materialYouAvailable("android", "34")).toBe(true);
    expect(materialYouAvailable("android", 30)).toBe(false);
    expect(materialYouAvailable("ios", 17)).toBe(false);
  });
  it("builds Material You colours from system roles and keeps them readable", () => {
    for (const [swatches, base] of [[M3_LIGHT, lightColors], [M3_DARK, darkColors]] as const) {
      const colors = materialYouColors(base, swatches);
      expect(colors.accent).toBe(swatches.primary);
      expect(colors.primaryText).toBe(swatches.onPrimary);
      expect(colors.glass).toBe(swatches.surface + "F5");
      expect(colors.success).toBe(base.success);
      for (const background of [colors.background, colors.raised, colors.selected, colors.userMessage])
        for (const foreground of [colors.text, colors.muted, colors.accent])
          expect(contrastOn(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("falls back to the classic colours while no system swatches are available", () => {
    const definition = PALETTES.find((item) => item.id === "material")!;
    expect(derivePaletteColors(definition, "dark", darkColors)).toBe(darkColors);
    expect(derivePaletteColors(definition, "light", lightColors)).toBe(lightColors);
    expect(resolveMobilePalette("material", "dark").colors).toBe(darkColors);
  });
  it("uses classic Uniwind themes for Material You", () => {
    expect(uniwindThemeName("material", "dark")).toBe("dark");
    expect(uniwindThemeName("material", "light")).toBe("light");
    expect(normalizePalette("material")).toBe("material");
  });
  it("keeps classic equal to the original colours", () => {
    expect(resolveMobilePalette("classic", "dark").colors).toBe(darkColors);
    expect(resolveMobilePalette("classic", "light").colors).toBe(lightColors);
    expect(resolveMobilePalette("classic", "dark").semantic).toBe(semanticPalettes.dark);
    expect(darkColors.background).toBe("#0B0B0C");
    expect(lightColors.accentSolid).toBe("#0066CC");
  });
  it("derives distinct, cached colours for the desktop palettes and keeps the desktop status hues", () => {
    for (const id of HUE_IDS)
      for (const mode of ["light", "dark"] as const) {
        const { colors } = resolveMobilePalette(id, mode);
        const base = mode === "dark" ? darkColors : lightColors;
        expect(colors).toBe(resolveMobilePalette(id, mode).colors);
        expect(colors.background).not.toBe(base.background);
        expect(colors.success).toBe(statusInk(mode, "success", colors.text, PALETTES.find((item) => item.id === id)!.lightness));
      }
  });
  it("uses the preset accent in dark mode", () => {
    for (const palette of PALETTES.filter((item) => item.id !== "classic" && !item.dynamic))
      expect(resolveMobilePalette(palette.id, "dark").colors.accent).toBe("#" + palette.accent);
  });
  it("normalises unknown ids to classic", () => {
    expect(normalizePalette("olive")).toBe("olive");
    expect(normalizePalette("x")).toBe("classic");
    expect(normalizePalette(undefined)).toBe("classic");
  });
  it("registers every non-default Uniwind theme in the Metro config", () => {
    const metro = readFileSync(new URL("../../metro.config.cjs", import.meta.url), "utf8");
    for (const id of HUE_IDS)
      for (const mode of ["light", "dark"] as const)
        expect(metro).toContain(`"${uniwindThemeName(id, mode)}"`);
    expect(uniwindThemeName("classic", "dark")).toBe("dark");
  });
});

describe("desktop colour parity", () => {
  it("classic status text is the desktop hue with the desktop ink mix", () => {
    expect(STATUS_HUES.dark.success).toBe("#4ADE80");
    expect(STATUS_HUES.light.danger).toBe("#B91C1C");
    for (const mode of ["light", "dark"] as const) {
      const colors = mode === "dark" ? darkColors : lightColors;
      for (const name of ["success", "warning", "danger"] as const)
        expect(colors[name]).toBe(statusInk(mode, name, colors.text, 5));
    }
  });
  it("tints status tones over the panel at 16% dark and 8% light", () => {
    expect(semanticPalettes.dark.success.surface).toBe(mixHex(darkColors.success, darkColors.panel, 16));
    expect(semanticPalettes.light.danger.surface).toBe(mixHex(lightColors.danger, lightColors.panel, 8));
  });
  it("diff and merged tokens follow the desktop emerald, rose and feature purple", () => {
    expect(darkColors.diffAdd).toBe("#10B981");
    expect(darkColors.diffDel).toBe("#F43F5E");
    expect(darkColors.diffAddBg).toBe(mixHex("#10B981", darkColors.panel, 15));
    expect(darkColors.diffAddGutter).toBe(mixHex("#10B981", darkColors.panel, 25));
    expect(lightColors.diffAddText).toBe("#047857");
    expect(darkColors.merged).toBe("#C084FC");
    expect(lightColors.merged).toBe("#7E22CE");
  });
});

describe("solid status ink", () => {
  it("reads on every classic status fill in both modes", () => {
    for (const mode of ["light", "dark"] as const) {
      const colors = mode === "dark" ? darkColors : lightColors;
      for (const name of ["success", "warning", "danger"] as const)
        expect(contrastRatio(colors.statusOnSolid, colors[name])).toBeGreaterThanOrEqual(4.5);
    }
  });
});
