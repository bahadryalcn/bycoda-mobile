/**
 * Composer turn modes are leading commands inside the draft text, so they persist with the draft
 * and reset when it is cleared after a send. Plan maps to the Host `intent: "plan"` and Draft to
 * the Host `draft` command. Operator and Orchestrator are not offered: desktop only enables them
 * for local sessions (`Composer.tsx` gates both on `!remote`) and the Host has no handling for them.
 */
export type ComposerMode = "plan" | "draft";

export const COMPOSER_MODES: readonly ComposerMode[] = ["plan", "draft"];

const PREFIX: Record<ComposerMode, RegExp> = {
  plan: /^\s*\/plan(?=\s|$)\s*/i,
  draft: /^\s*\/draft(?=\s|$)\s*/i,
};

/** The leading mode command of the text, or null. At most one is active. */
export function activeComposerMode(text: string): ComposerMode | null {
  return COMPOSER_MODES.find((mode) => PREFIX[mode].test(text)) ?? null;
}

/** The text without its leading mode command. */
export function stripComposerMode(text: string): string {
  const mode = activeComposerMode(text);
  return mode ? text.replace(PREFIX[mode], "") : text;
}

/** Selects a mode (replacing any other) or, when it is already active or null, clears the mode. */
export function setComposerMode(text: string, next: ComposerMode | null): string {
  const current = activeComposerMode(text);
  const rest = stripComposerMode(text);
  return next && next !== current ? `/${next} ${rest}` : rest;
}

export function planModeActive(text: string): boolean {
  return activeComposerMode(text) === "plan";
}

/** Turns Plan mode on or off by adding or removing the leading command, keeping the rest of the draft. */
export function togglePlanMode(text: string): string {
  return setComposerMode(text, "plan");
}

/**
 * A leading `!` runs the line in the computer's shell instead of sending a prompt (desktop
 * `leadingModeCommand` in modeCommands.tsx). `![alt](url)` is a Markdown image, not a command.
 * Offered only when the Host advertises `sessions.shell`; it is not one of the picker modes.
 */
export function shellModeActive(text: string): boolean {
  return /^\s*!(?!\[)/.test(text);
}

/** The text without its leading `!`, which turns Shell mode off. */
export function stripShellMode(text: string): string {
  return shellModeActive(text) ? text.replace(/^\s*!\s*/, "") : text;
}
