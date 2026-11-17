import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { Uniwind } from "uniwind";

import { readMaterialYouSwatches } from "./palettes.ts";
import { themeColorRoles } from "./theme-color-roles.ts";
import { isMaterialYouRefreshDue, swatchSetChanged, type SwatchSet } from "./theme-material-you-model.ts";
import {
  getMobilePalette,
  getMobileThemeMode,
  refreshMaterialYouPalette,
  resolveMobilePalette,
} from "./tokens.ts";

const readSwatchSet = (): SwatchSet => ({
  light: readMaterialYouSwatches("light"),
  dark: readMaterialYouSwatches("dark"),
});

/**
 * Re-reads the Android system wallpaper colours each time the app becomes active. A wallpaper change
 * happens while the app is in the background, so the palette cache is refreshed only then, and only
 * when Material You is the selected palette and the swatches really changed.
 */
export function useMaterialYouWallpaperRefresh() {
  useEffect(() => {
    // Reason: record the swatches the palette was resolved with, so the first foreground can detect a change.
    let applied: SwatchSet | null = readSwatchSet();
    const subscription = AppState.addEventListener("change", (state) => {
      const next = readSwatchSet();
      const previous = applied;
      applied = next;
      if (!isMaterialYouRefreshDue(getMobilePalette(), Platform.OS, state)) return;
      if (!swatchSetChanged(previous, next)) return;
      refreshMaterialYouPalette();
      // Material You shares the base Uniwind theme names, so its CSS roles are pushed explicitly.
      const mode = getMobileThemeMode();
      Uniwind.updateCSSVariables(mode, Object.fromEntries(
        Object.entries(themeColorRoles(resolveMobilePalette("material", mode))).map(([key, value]) => [`--color-${key}`, value]),
      ));
    });
    return () => subscription.remove();
  }, []);
}
