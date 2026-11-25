import { Appearance } from "react-native";

type RequestedTheme = "system" | "light" | "dark";

/**
 * The window style that the status bar, keyboard, alerts and pickers follow: an explicit app
 * theme overrides the device, "system" removes the override.
 */
export function nativeColorScheme(requested: RequestedTheme): "light" | "dark" | "auto" {
  return requested === "system" ? "auto" : requested;
}

/** Applies the app theme to native chrome. No-op on web, where the page owns its colour scheme. */
export function applyNativeColorScheme(requested: RequestedTheme) {
  if (process.env.EXPO_OS === "web") return;
  try {
    Appearance.setColorScheme(nativeColorScheme(requested));
  } catch {
    // An unavailable native module leaves the system appearance; the app colours still apply.
  }
}
