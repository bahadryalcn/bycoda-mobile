import type { MobileColors, MobileThemeMode } from "./tokens.ts";

/** Selectable colour palettes. `classic` is the original app look; the rest mirror the desktop presets. */
export const PALETTE_IDS = ["classic", "bycoda", "olive", "tide", "kiln", "dusk", "ink"] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];
export const DEFAULT_PALETTE: PaletteId = "classic";

export type PaletteDefinition = {
  id: PaletteId;
  name: string;
  /** Turkish name; only `classic` differs. */
  nameTr: string;
  /** Hue 0-360, saturation 0-100, dark canvas lightness 0-100 (desktop `themePalettes` data). */
  hue: number;
  saturation: number;
  lightness: number;
  /** Dark-mode accent as six hex digits (no leading marker). */
  accent: string;
};

// Data copied from the desktop `themePalettes` presets. `classic` keeps static colours in tokens.ts.
export const PALETTES: readonly PaletteDefinition[] = [
  { id: "classic", name: "Classic", nameTr: "Klasik", hue: 240, saturation: 4, lightness: 5, accent: "64B0FF" },
  { id: "bycoda", name: "bycoda", nameTr: "bycoda", hue: 216, saturation: 24, lightness: 4, accent: "A3ACB8" },
  { id: "olive", name: "Olive", nameTr: "Olive", hue: 150, saturation: 22, lightness: 7, accent: "69B68E" },
  { id: "tide", name: "Tide", nameTr: "Tide", hue: 205, saturation: 30, lightness: 7, accent: "65B4DB" },
  { id: "kiln", name: "Kiln", nameTr: "Kiln", hue: 25, saturation: 24, lightness: 7, accent: "DBA276" },
  { id: "dusk", name: "Dusk", nameTr: "Dusk", hue: 275, saturation: 24, lightness: 7, accent: "B297D4" },
  { id: "ink", name: "Ink", nameTr: "Ink", hue: 216, saturation: 0, lightness: 5, accent: "B8B8B8" },
];

export function normalizePalette(value: unknown): PaletteId {
  return PALETTE_IDS.includes(value as PaletteId) ? (value as PaletteId) : DEFAULT_PALETTE;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Pure HSL (degrees, percent, percent) to an uppercase #RRGGBB string. */
export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = ((hue % 360) + 360) % 360;
  const s = clamp(saturation, 0, 100) / 100;
  const l = clamp(lightness, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - (chroma / 2) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return "#" + [f(0), f(8), f(4)]
    .map((value) => Math.round(clamp(value, 0, 1) * 255).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s * 100, l * 100];
}

function luminance(hex: string) {
  const linear = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
export function contrastRatio(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

/** Lightness is lowered step by step until the accent reads on every given surface. */
function readableAccent(accent: string, surfaces: string[], target: number) {
  const [h, s, l] = hexToHsl(accent);
  for (let lightness = l; lightness >= 0; lightness -= 1) {
    const candidate = hslToHex(h, s, lightness);
    if (surfaces.every((surface) => contrastRatio(candidate, surface) >= target)) return candidate;
  }
  return hslToHex(h, s, 0);
}

const READABLE = 4.8;

/**
 * Full colour set for a derived palette. Surfaces are a tint ramp of the hue (desktop formulas);
 * success/danger/warning, scrim and the media viewer stay as in `base`.
 */
export function derivePaletteColors(definition: PaletteDefinition, mode: MobileThemeMode, base: MobileColors): MobileColors {
  const { hue: h, saturation: s, lightness: L } = definition;
  const hsl = (sat: number, light: number) => hslToHex(h, sat, light);
  if (mode === "dark") {
    const lb = Math.max(2, L - 1);
    const background = hsl(s * 0.6, lb);
    const panel = hsl(s * 0.7, lb + 4);
    const raised = hsl(s * 0.7, lb + 7);
    const elevated = hsl(s * 0.7, lb + 9);
    const accent = "#" + definition.accent;
    const solid = bestInk(accent, hsl(s * 0.6, 6));
    return {
      ...base,
      background,
      panel,
      raised,
      fill: hsl(s * 0.7, lb + 3),
      elevated,
      border: hsl(s * 0.5, lb + 14),
      separator: hsl(s * 0.6, lb + 6),
      text: hsl(s * 0.3, 96),
      muted: hsl(s * 0.2, 68),
      subtle: hsl(s * 0.2, 68),
      tertiary: hsl(s * 0.15, 46),
      accent,
      accentSolid: accent,
      primaryText: solid,
      info: accent,
      live: accent,
      brand: hsl(s * 0.3, 96),
      selected: hsl(Math.min(60, s * 1.6), lb + 12),
      userMessage: raised,
      glass: elevated + "F5",
    };
  }
  const background = hsl(s * 0.2, 98.6);
  const panel = hslToHex(0, 0, 100);
  const raised = hsl(s * 0.3, 95.5);
  const selected = hsl(Math.min(60, s * 1.4), 92);
  const userMessage = hsl(s * 0.3, 94.5);
  const surfaces = [background, panel, raised, selected, userMessage];
  const accent = readableAccent("#" + definition.accent, surfaces, READABLE);
  return {
    ...base,
    background,
    panel,
    raised,
    fill: raised,
    elevated: panel,
    border: hsl(s * 0.3, 88),
    separator: hsl(s * 0.3, 93),
    text: hsl(s * 0.35, 13),
    muted: hsl(s * 0.2, 36),
    subtle: hsl(s * 0.2, 36),
    tertiary: hsl(s * 0.15, 56),
    accent,
    accentSolid: accent,
    primaryText: bestInk(accent, hsl(s * 0.6, 6)),
    info: accent,
    live: accent,
    brand: hsl(s * 0.35, 13),
    selected,
    userMessage,
    glass: panel + "F5",
  };
}

/** White or the given dark ink, whichever reads better on the fill. */
function bestInk(fill: string, dark: string) {
  const white = hslToHex(0, 0, 100);
  return contrastRatio(white, fill) >= contrastRatio(dark, fill) ? white : dark;
}

/** Tinted info surface and border for a derived palette (semantic tones other than info are not tinted). */
export function deriveInfoTone(colors: MobileColors, mode: MobileThemeMode, definition: PaletteDefinition) {
  return {
    text: colors.info,
    surface: colors.selected,
    border: mode === "dark"
      ? hslToHex(definition.hue, definition.saturation * 0.6, Math.max(2, definition.lightness - 1) + 20)
      : hslToHex(definition.hue, definition.saturation * 0.5, 80),
  };
}

/** Uniwind theme names: classic keeps light/dark; every other palette adds `<id>` and `<id>-dark`. */
export const uniwindThemeName = (palette: PaletteId, mode: MobileThemeMode) =>
  palette === "classic" ? mode : mode === "dark" ? `${palette}-dark` : palette;
