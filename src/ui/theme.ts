import { useSyncExternalStore } from "react";
import { colors, getMobileThemeMode, semanticColors, subscribeMobileTheme } from "./tokens";

export { colors, semanticColors } from "./tokens";
export { createThemedStyles } from "./themed-styles";

/** Subscribe without remounting screens, clearing drafts, or replacing queries. */
export function useMobileTheme() {
  const mode = useSyncExternalStore(subscribeMobileTheme, getMobileThemeMode, getMobileThemeMode);
  return { mode, colors, semanticColors };
}
