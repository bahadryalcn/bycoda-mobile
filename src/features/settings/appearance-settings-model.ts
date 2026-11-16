import type { useCopy } from "@/ui/copy";
import type { ThemeMode } from "@/state/appearance";
import { DEFAULT_TYPOGRAPHY, type TypographyPreferences } from "@/ui/typography-preferences";

type Copy = ReturnType<typeof useCopy>;

/** Slider ranges; they mirror the store's normalization so every reachable value is persisted as shown. */
export const TEXT_SCALE_RANGE = { min: 0.85, max: 1.3, step: 0.05 } as const;
export const LINE_SPACING_RANGE = { min: 1, max: 1.5, step: 0.05 } as const;

/** Whole-percent text such as "115%", shared by the slider value and the settings summary. */
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function themeModeOptions(copy: Copy) {
  return [
    { value: "system" as const, label: copy("Sistem", "System") },
    { value: "light" as const, label: copy("Açık", "Light") },
    { value: "dark" as const, label: copy("Koyu", "Dark") },
  ] satisfies { value: ThemeMode; label: string }[];
}

export function fontFamilyOptions(copy: Copy) {
  return [
    { value: "system" as const, label: copy("Sistem", "System") },
    { value: "sans" as const, label: copy("Sans serif", "Sans serif") },
    { value: "serif" as const, label: copy("Serif", "Serif") },
    { value: "mono" as const, label: copy("Eş aralıklı", "Monospace") },
  ] satisfies { value: TypographyPreferences["fontFamily"]; label: string }[];
}

export function fontWeightOptions(copy: Copy) {
  return [
    { value: "regular" as const, label: copy("Normal", "Regular") },
    { value: "medium" as const, label: copy("Orta", "Medium") },
    { value: "bold" as const, label: copy("Kalın", "Bold") },
  ] satisfies { value: TypographyPreferences["weight"]; label: string }[];
}

/** True when every general typography choice equals its default; nothing to reset. */
export function isDefaultTypography(value: TypographyPreferences): boolean {
  return (
    value.fontFamily === DEFAULT_TYPOGRAPHY.fontFamily &&
    value.weight === DEFAULT_TYPOGRAPHY.weight &&
    Math.abs(value.scale - DEFAULT_TYPOGRAPHY.scale) < 1e-9 &&
    Math.abs(value.lineSpacing - DEFAULT_TYPOGRAPHY.lineSpacing) < 1e-9
  );
}

/**
 * The Settings row summary: theme and palette always, text scale only when it differs from the
 * default so the common case stays short. Theme/palette labels are resolved by the caller.
 */
export function appearanceSummary(parts: { theme: string; palette: string; scale: number }): string {
  const summary = [parts.theme, parts.palette];
  if (Math.abs(parts.scale - DEFAULT_TYPOGRAPHY.scale) >= 1e-9) summary.push(formatPercent(parts.scale));
  return summary.join(", ");
}
