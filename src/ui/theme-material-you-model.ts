import type { MaterialYouSwatches } from "./palettes.ts";

/** System swatches read for both modes at one moment. Null where the platform has no Material You. */
export type SwatchSet = { light: MaterialYouSwatches | null; dark: MaterialYouSwatches | null };

/** Re-read the wallpaper colours only when the Material You palette is the one in use on Android. */
export function isMaterialYouRefreshDue(palette: string, platform: string, appState: string): boolean {
  return palette === "material" && platform === "android" && appState === "active";
}

/**
 * True when the system swatches differ from the ones last applied. A reading with no swatches at all
 * (module missing, below Android 12) never counts as a change, so the palette is kept as it is.
 */
export function swatchSetChanged(previous: SwatchSet | null, next: SwatchSet): boolean {
  if (!next.light && !next.dark) return false;
  if (!previous) return true;
  return JSON.stringify(previous.light) !== JSON.stringify(next.light)
    || JSON.stringify(previous.dark) !== JSON.stringify(next.dark);
}
