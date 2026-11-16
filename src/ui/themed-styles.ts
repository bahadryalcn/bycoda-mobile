import { useSyncExternalStore } from "react";
import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import { getMobileThemeKey, splitThemeKey, subscribeMobileTheme, withMobileTheme, type ThemeKey } from "./tokens";
import { applyTextPreferences, getTypographyKey, subscribeTypography } from "./typography-runtime";

export const getMobileStyleKey = () => `${getMobileThemeKey()}|${getTypographyKey()}`;
export const subscribeMobileStyles = (listener: () => void) => {
  const theme = subscribeMobileTheme(listener);
  const typography = subscribeTypography(listener);
  return () => { theme(); typography(); };
};

type NativeStyle = ViewStyle | TextStyle | ImageStyle;
type NamedStyles<T> = { [Key in keyof T]: NativeStyle };

const resolveForMode = Symbol("resolveThemedStyles");

/**
 * Native style objects are resolved when read, rather than freezing the startup
 * palette in StyleSheet.create. Cache one set per palette and mode; layout identity remains
 * stable between changes. Renderers read the per-theme object through
 * useMobileTheme() / useThemedStyles() so React Compiler sees the mode change.
 */
export function createThemedStyles<T extends NamedStyles<T>>(factory: () => T): T {
  const cache = new Map<ThemeKey, T>();
  let typographyKey = getTypographyKey();
  const resolve = (key: ThemeKey = getMobileThemeKey(), nextTypographyKey = getTypographyKey()) => {
    if (typographyKey !== nextTypographyKey) {
      cache.clear();
      typographyKey = nextTypographyKey;
    }
    let styles = cache.get(key);
    if (!styles) {
      const [palette, mode] = splitThemeKey(key);
      const raw = withMobileTheme(palette, mode, factory);
      styles = Object.fromEntries(Object.entries(raw).map(([name, style]) => [name, applyTextPreferences(style as NativeStyle)])) as T;
      cache.set(key, styles);
    }
    return styles;
  };
  return new Proxy({} as T, {
    get: (_target, key) => (key === resolveForMode ? resolve : Reflect.get(resolve(), key)),
    ownKeys: () => Reflect.ownKeys(resolve()),
    getOwnPropertyDescriptor: (_target, key) => ({
      configurable: true,
      enumerable: true,
      value: Reflect.get(resolve(), key),
    }),
  });
}

/** The plain style object of a themed sheet for one palette and mode; identity changes with either. */
export function resolveThemedStyles<T>(sheet: T, key: ThemeKey, typographyKey = getTypographyKey()): T {
  const resolve = (sheet as { [resolveForMode]?: (key: ThemeKey, typographyKey: string) => T })[resolveForMode];
  return resolve ? resolve(key, typographyKey) : sheet;
}

/** Subscribe to the theme and return the sheet resolved for it (hook, so the compiler re-runs readers). */
export function useThemedStyles<T>(sheet: T): T {
  const snapshot = useSyncExternalStore(subscribeMobileStyles, getMobileStyleKey, getMobileStyleKey);
  const [themeKey, typographyKey] = snapshot.split("|");
  return resolveThemedStyles(sheet, themeKey as ThemeKey, typographyKey);
}
