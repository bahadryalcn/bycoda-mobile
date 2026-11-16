/** Shared typography vocabulary; persistence and runtime use the same bounds and defaults. */
export const FONT_FAMILIES = ["system", "sans", "serif", "mono"] as const;
export const FONT_WEIGHTS = ["regular", "medium", "bold"] as const;
export type TypographyPreferences = {
  scale: number;
  fontFamily: (typeof FONT_FAMILIES)[number];
  weight: (typeof FONT_WEIGHTS)[number];
  lineSpacing: number;
};
export const DEFAULT_TYPOGRAPHY: TypographyPreferences = {
  scale: 1, fontFamily: "system", weight: "regular", lineSpacing: 1,
};

function bounded(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(Math.min(max, Math.max(min, value)) * 20) / 20 : fallback;
}

/** Old records and unknown fields keep the original native typography. */
export function normalizeTypography(value: unknown): TypographyPreferences {
  const stored = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<TypographyPreferences> : {};
  return {
    scale: bounded(stored.scale, 0.85, 1.3, 1),
    fontFamily: FONT_FAMILIES.includes(stored.fontFamily!) ? stored.fontFamily! : "system",
    weight: FONT_WEIGHTS.includes(stored.weight!) ? stored.weight! : "regular",
    lineSpacing: bounded(stored.lineSpacing, 1, 1.5, 1),
  };
}
