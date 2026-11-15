import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PALETTE_IDS, PALETTES, hslToHex, normalizePalette, uniwindThemeName } from "./palettes";
import { darkColors, lightColors, resolveMobilePalette, semanticPalettes } from "./tokens";

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
  it("offers nine unique persisted palette choices", () => {
    expect(PALETTES).toHaveLength(9);
    expect(new Set(PALETTE_IDS).size).toBe(9);
    expect(PALETTES.map(palette => palette.id)).toEqual([...PALETTE_IDS]);
  });
  it("keeps classic equal to the original colours", () => {
    expect(resolveMobilePalette("classic", "dark").colors).toBe(darkColors);
    expect(resolveMobilePalette("classic", "light").colors).toBe(lightColors);
    expect(resolveMobilePalette("classic", "dark").semantic).toBe(semanticPalettes.dark);
    expect(darkColors.background).toBe("#0B0B0C");
    expect(lightColors.accentSolid).toBe("#0066CC");
  });
  it("derives distinct, cached colours for the desktop palettes and keeps status colours", () => {
    for (const id of PALETTE_IDS.filter((item) => item !== "classic"))
      for (const mode of ["light", "dark"] as const) {
        const { colors } = resolveMobilePalette(id, mode);
        const base = mode === "dark" ? darkColors : lightColors;
        expect(colors).toBe(resolveMobilePalette(id, mode).colors);
        expect(colors.background).not.toBe(base.background);
        expect(colors.success).toBe(base.success);
        expect(colors.danger).toBe(base.danger);
        expect(colors.warning).toBe(base.warning);
      }
  });
  it("uses the preset accent in dark mode", () => {
    for (const palette of PALETTES.filter((item) => item.id !== "classic"))
      expect(resolveMobilePalette(palette.id, "dark").colors.accent).toBe("#" + palette.accent);
  });
  it("normalises unknown ids to classic", () => {
    expect(normalizePalette("olive")).toBe("olive");
    expect(normalizePalette("x")).toBe("classic");
    expect(normalizePalette(undefined)).toBe("classic");
  });
  it("registers every non-default Uniwind theme in the Metro config", () => {
    const metro = readFileSync(new URL("../../metro.config.cjs", import.meta.url), "utf8");
    for (const id of PALETTE_IDS.filter((item) => item !== "classic"))
      for (const mode of ["light", "dark"] as const)
        expect(metro).toContain(`"${uniwindThemeName(id, mode)}"`);
    expect(uniwindThemeName("classic", "dark")).toBe("dark");
  });
});
