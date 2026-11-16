import { useSyncExternalStore } from "react";
import { uiStyles } from "./styles";
import { resolveThemedStyles, getMobileStyleKey, subscribeMobileStyles } from "./themed-styles";
import { getTypographyKey } from "./typography-runtime";
import {
  resolveMobilePalette,
  splitThemeKey,
  type ThemeKey,
} from "./tokens";

export { colors, semanticColors } from "./tokens";
export { createThemedStyles, useThemedStyles } from "./themed-styles";

const themes = new Map<ThemeKey, ReturnType<typeof createTheme>>();
let typographyKey = getTypographyKey();
function createTheme(key: ThemeKey, typographyKey: string) {
  const [palette, mode] = splitThemeKey(key);
  const { colors, semantic } = resolveMobilePalette(palette, mode);
  return {
    mode,
    palette,
    colors,
    semanticColors: semantic,
    uiStyles: resolveThemedStyles(uiStyles, key, typographyKey),
    /** Pressed row fill: panel in dark, raised in light. */
    pressedFill: mode === "dark" ? colors.panel : colors.raised,
  };
}

/**
 * Subscribe to the palette and mode and return their colours and shared styles as plain objects whose
 * identity changes with either. Components must read theme values from this result
 * (never the module-level accessors) so React Compiler re-runs their memoized JSX.
 */
export function useMobileTheme() {
  const snapshot = useSyncExternalStore(subscribeMobileStyles, getMobileStyleKey, getMobileStyleKey);
  const [themeKey, nextTypographyKey] = snapshot.split("|");
  const key = themeKey as ThemeKey;
  if (typographyKey !== nextTypographyKey) {
    themes.clear();
    typographyKey = nextTypographyKey!;
  }
  let theme = themes.get(key);
  if (!theme) {
    theme = createTheme(key, typographyKey);
    themes.set(key, theme);
  }
  return theme;
}
