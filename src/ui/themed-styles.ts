import { useSyncExternalStore } from "react";
import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import { getMobileThemeKey, splitThemeKey, subscribeMobileTheme, withMobileTheme, type ThemeKey } from "./tokens";

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
  const resolve = (key: ThemeKey = getMobileThemeKey()) => {
    let styles = cache.get(key);
    if (!styles) {
      const [palette, mode] = splitThemeKey(key);
      styles = withMobileTheme(palette, mode, factory);
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
export function resolveThemedStyles<T>(sheet: T, key: ThemeKey): T {
  const resolve = (sheet as { [resolveForMode]?: (key: ThemeKey) => T })[resolveForMode];
  return resolve ? resolve(key) : sheet;
}

/** Subscribe to the theme and return the sheet resolved for it (hook, so the compiler re-runs readers). */
export function useThemedStyles<T>(sheet: T): T {
  const key = useSyncExternalStore(subscribeMobileTheme, getMobileThemeKey, getMobileThemeKey);
  return resolveThemedStyles(sheet, key);
}
