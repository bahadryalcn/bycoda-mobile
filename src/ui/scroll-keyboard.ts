type DismissMode = "none" | "interactive" | "on-drag";

/** RN Web's on-drag also blurs inputs on browser/programmatic scroll events. */
export function scrollKeyboardDismissMode(
  nativeMode: DismissMode = process.env.EXPO_OS === "ios" ? "interactive" : "on-drag",
): DismissMode {
  return process.env.EXPO_OS === "web" ? "none" : nativeMode;
}
