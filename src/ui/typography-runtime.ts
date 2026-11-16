import type { TextStyle } from "react-native";
import { DEFAULT_TYPOGRAPHY, normalizeTypography, type TypographyPreferences } from "./typography-preferences";

let active = DEFAULT_TYPOGRAPHY;
let key = JSON.stringify(active);
const listeners = new Set<() => void>();
export const getTypographyKey = () => key;
export const subscribeTypography = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** Change presentation without replacing providers, navigation, or editor state. */
export function applyTypography(value: TypographyPreferences) {
  const next = normalizeTypography(value);
  const nextKey = JSON.stringify(next);
  if (nextKey === key) return;
  active = next;
  key = nextKey;
  for (const listener of listeners) listener();
}

export function typographyFont(family: TypographyPreferences["fontFamily"], platform = process.env.EXPO_OS) {
  switch (family) {
    case "sans": return platform === "ios" ? "Helvetica Neue" : "sans-serif";
    case "serif": return platform === "ios" ? "Georgia" : "serif";
    case "mono": return platform === "ios" ? "Menlo" : "monospace";
    default: return undefined;
  }
}

/** Only text declarations change. Monospace roles and semantic weight hierarchy survive. */
export function applyTextPreferences<T extends object>(style: T): T {
  const text = style as TextStyle;
  if (typeof text.fontSize !== "number") return style;
  const family = text.fontFamily ?? typographyFont(active.fontFamily);
  const baseWeight = text.fontWeight === "bold" ? 700 : Number(text.fontWeight) || 400;
  const floor = active.weight === "bold" ? 700 : active.weight === "medium" ? 500 : 400;
  return {
    ...style,
    fontSize: text.fontSize * active.scale,
    lineHeight: (text.lineHeight ?? text.fontSize * 1.4) * active.scale * active.lineSpacing,
    ...(family ? { fontFamily: family } : {}),
    ...(active.weight !== "regular" ? { fontWeight: String(Math.max(baseWeight, floor)) as TextStyle["fontWeight"] } : {}),
  };
}
