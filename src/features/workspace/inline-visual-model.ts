import {
  inlineVisualBaseCss,
  inlineVisualValue,
  type InlineVisualTheme,
} from "../../../../src/features/sessions/model/inlineVisual";

/** The Host read that returns a stored visual's source (`sessions.inlineVisual`). */
export const INLINE_VISUAL_CAPABILITY = "sessions.inlineVisual";
/** Inline frame budget: tall visuals scroll in full screen instead of filling the transcript. */
export const INLINE_VISUAL_MAX_FRAME = 360;

/**
 * How a block's agent-drawn visual (`conversation_visuals_render`) reads on the phone: a legacy
 * snapshot carries its HTML, a stored reference needs the Host read behind its capability, and an
 * older computer or an invalid value leaves a titled row that points to the computer.
 */
export type InlineVisualPresentation =
  | { kind: "snapshot"; title: string; html: string; height: number }
  | { kind: "stored"; id: string; title: string; height: number }
  | { kind: "unavailable"; title?: string };

export function inlineVisualPresentation(value: unknown, capabilities: readonly string[] | undefined): InlineVisualPresentation {
  const visual = inlineVisualValue(value);
  if (!visual) return { kind: "unavailable" };
  if (visual.version === 1) return { kind: "snapshot", title: visual.title, html: visual.html, height: visual.height };
  if (!capabilities?.includes(INLINE_VISUAL_CAPABILITY)) return { kind: "unavailable", title: visual.title };
  return { kind: "stored", id: visual.id, title: visual.title, height: visual.height };
}

/** The visual's declared height, bounded for the transcript. */
export function inlineVisualFrameHeight(height: number) {
  return Math.min(Math.max(height, 80), INLINE_VISUAL_MAX_FRAME);
}

/** Phone theme values the visual may read, in the desktop's variable names. */
export type InlineVisualColors = {
  panel: string; raised: string; fill: string; border: string; text: string; muted: string;
  accent: string; accentSolid: string; primaryText: string;
  success: string; warning: string; danger: string; info: string;
};

export function inlineVisualTheme(colors: InlineVisualColors): InlineVisualTheme {
  return {
    "--background": colors.panel,
    "--foreground": colors.text,
    "--muted": colors.fill,
    "--muted-foreground": colors.muted,
    "--card": colors.raised,
    "--card-foreground": colors.text,
    "--popover": colors.raised,
    "--popover-foreground": colors.text,
    "--border": colors.border,
    "--primary": colors.accentSolid,
    "--primary-foreground": colors.primaryText,
    "--accent": colors.accent,
    "--success": colors.success,
    "--warning": colors.warning,
    "--destructive": colors.danger,
    "--info": colors.info,
    "--chart-1": colors.accent,
    "--chart-2": colors.success,
    "--chart-3": colors.warning,
    "--chart-4": colors.info,
    "--chart-5": colors.danger,
  };
}

/**
 * The visual's body after the desktop's base sheet. The preview owner adds its own stricter
 * policy (no network, no navigation), so only the theme and the visual's markup are given here.
 */
export function inlineVisualDocument(html: string, dark: boolean, theme: InlineVisualTheme) {
  const body = html.replace(/^\s*<!doctype[^>]*>/i, "");
  return `<style>${inlineVisualBaseCss(dark, theme)}</style>${body}`;
}
