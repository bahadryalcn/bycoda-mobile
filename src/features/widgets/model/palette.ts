import { semanticPalettes, themePalettes } from "@/ui/tokens";

import type { WidgetPalette, WidgetSnapshot } from "./snapshot";

function palette(mode: "light" | "dark"): WidgetPalette {
  const theme = themePalettes[mode];
  const semantic = semanticPalettes[mode];
  return {
    background: theme.background,
    surface: theme.raised,
    foreground: theme.text,
    secondary: theme.muted,
    track: theme.border,
    accent: theme.accent,
    danger: semantic.danger.text,
    warning: semantic.warning.text,
    success: semantic.success.text,
    accentSoft: semantic.info.surface,
    dangerSoft: semantic.danger.surface,
    warningSoft: semantic.warning.surface,
    successSoft: semantic.success.surface,
  };
}

/** Both modes ship in every snapshot; Compose widgets cannot read the app theme. */
export const widgetPalette: WidgetSnapshot["palette"] = {
  light: palette("light"),
  dark: palette("dark"),
};
