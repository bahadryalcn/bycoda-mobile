import { semanticPalettes, themePalettes } from "@/ui/tokens";

import type { WidgetPalette, WidgetSnapshot } from "./snapshot";

function palette(mode: "light" | "dark"): WidgetPalette {
  const theme = themePalettes[mode];
  return {
    background: theme.background,
    foreground: theme.text,
    secondary: theme.muted,
    track: theme.border,
    accent: theme.accent,
    danger: semanticPalettes[mode].danger.text,
    warning: semanticPalettes[mode].warning.text,
    success: semanticPalettes[mode].success.text,
  };
}

/** Both modes ship in every snapshot; Compose widgets cannot read the app theme. */
export const widgetPalette: WidgetSnapshot["palette"] = {
  light: palette("light"),
  dark: palette("dark"),
};
