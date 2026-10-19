import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import { getMobileThemeMode, type MobileThemeMode } from "./tokens";

type NativeStyle = ViewStyle | TextStyle | ImageStyle;
type NamedStyles<T> = { [Key in keyof T]: NativeStyle };

/**
 * Native style objects are resolved when read, rather than freezing the startup
 * palette in StyleSheet.create. Cache one set per mode; layout identity remains
 * stable between changes. Renderers subscribe through useMobileTheme().
 */
export function createThemedStyles<T extends NamedStyles<T>>(factory: () => T): T {
  const cache = new Map<MobileThemeMode, T>();
  const resolve = () => {
    const mode = getMobileThemeMode();
    let styles = cache.get(mode);
    if (!styles) {
      styles = factory();
      cache.set(mode, styles);
    }
    return styles;
  };
  return new Proxy({} as T, {
    get: (_target, key) => Reflect.get(resolve(), key),
    ownKeys: () => Reflect.ownKeys(resolve()),
    getOwnPropertyDescriptor: (_target, key) => ({
      configurable: true,
      enumerable: true,
      value: Reflect.get(resolve(), key),
    }),
  });
}
