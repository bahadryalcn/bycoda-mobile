import { memo, useMemo } from "react";
import { CodeText } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { darkColors, terminalAnsiPalettes, type MobileThemeMode } from "@/ui/tokens";
import { plainAnsiRun, terminalAnsiRuns, terminalAnsiTextStyle } from "./terminal-output-ansi";

/**
 * Captured shell output as selectable monospace text with its ANSI styles. `mode` pins a palette for
 * a reader that always draws on a dark stage; otherwise the active theme's palette and ink apply.
 */
export const TerminalAnsiText = memo(function TerminalAnsiText({ output, mode, surface }: {
  output: string; mode?: MobileThemeMode; surface?: string;
}) {
  const theme = useMobileTheme();
  const scheme = mode ?? theme.mode;
  const ink = mode === "dark" ? darkColors.text : theme.colors.text;
  const ground = surface ?? (mode === "dark" ? darkColors.background : theme.colors.panel);
  const palette = terminalAnsiPalettes[scheme];
  const runs = useMemo(() => terminalAnsiRuns(output), [output]);
  const children = useMemo(() => runs.map((run, index) => plainAnsiRun(run)
    ? run.text
    : <CodeText key={index} style={terminalAnsiTextStyle(run, palette, ink, ground)}>{run.text}</CodeText>),
  [runs, palette, ink, ground]);
  return <CodeText selectable style={{ color: ink }}>{children}</CodeText>;
});
