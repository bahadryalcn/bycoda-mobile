import type { AssistantVoiceState } from "../assistant/assistant-voice";
import type { TranscriptionEngine } from "../voice-settings/voice-preferences";

/** Longest draft the composer field accepts. */
const DRAFT_LIMIT = 256_000;

/** Adds recognized speech after the existing text with one separating space (or none after whitespace). */
export function appendDictation(text: string, spoken: string): string {
  const addition = spoken.trim();
  if (!addition) return text;
  const joined = !text || /\s$/.test(text) ? text + addition : `${text} ${addition}`;
  if (joined.length > DRAFT_LIMIT) throw new Error("The message is too long. Shorten the draft before dictating.");
  return joined;
}

/**
 * The words a finished recording produced. Nothing recognized (silence, noise, or speech the recognizer
 * could not decode) is an error the owner sees; without it the recording would end with no result and no reason.
 */
export function recognizedDictation(text: string): string {
  const spoken = text.trim();
  if (!spoken) throw new Error("Speech could not be recognized. Try again.");
  return spoken;
}

/** Characters that take no space before dictated words (an opening bracket or quote). */
const OPENS = /[([{"'“‘«]$/;
/** Characters that take no space after dictated words (closing punctuation). */
const CLOSES = /^[.,;:!?)\]}"'”’»…]/;

/**
 * Inserts recognized speech at the cursor (replacing a selection) with smart spacing: one space
 * between words on either side, none next to whitespace, opening brackets or closing punctuation.
 * Returns the text and the caret placed after the inserted words.
 */
export function insertDictation(
  text: string,
  selection: { start: number; end: number },
  spoken: string,
): { text: string; selection: { start: number; end: number } } {
  const addition = spoken.trim();
  const clamp = (value: number) => Math.max(0, Math.min(text.length, Number.isFinite(value) ? Math.floor(value) : text.length));
  const start = clamp(Math.min(selection.start, selection.end)), end = clamp(Math.max(selection.start, selection.end));
  if (!addition) return { text, selection: { start, end } };
  const before = text.slice(0, start), after = text.slice(end);
  const lead = before && !/\s$/.test(before) && !OPENS.test(before) ? " " : "";
  const trail = after && !/^\s/.test(after) && !CLOSES.test(after) ? " " : "";
  const joined = before + lead + addition + trail + after;
  if (joined.length > DRAFT_LIMIT) throw new Error("The message is too long. Shorten the draft before dictating.");
  const caret = before.length + lead.length + addition.length + trail.length;
  return { text: joined, selection: { start: caret, end: caret } };
}

/** Why the app stopped a recording itself; the composer words it in the owner's language. */
export class DictationInterrupted extends Error {
  constructor(readonly reason: "background" | "locked") {
    super(reason === "locked"
      ? "Dictation stopped because bycoda locked. Unlock and try again."
      : "Dictation stopped because bycoda went to the background. Return to bycoda and try again.");
    this.name = "DictationInterrupted";
  }
}

/**
 * Capture continues only while unlocked and in front. Android reports window focus loss (and the
 * security store follows it) for the notification shade, a permission dialog or a foreground-service
 * heads-up while the app stays `active`; none of that stops dictation. Only a real background or
 * lock does. The iOS microphone permission dialog makes the app "inactive" for a moment; that prompt
 * is ours, so it must not stop dictation either.
 */
export function captureAllowed(
  state: { status: string; appState: string },
  promptCovering: () => boolean,
): boolean {
  if (state.status !== "unlocked") return false;
  if (state.appState === "active") return true;
  return state.appState === "inactive" && promptCovering();
}

/** Which interruption the owner is told about when capture is no longer allowed. */
export function dictationInterruption(state: { status: string }): DictationInterrupted {
  return new DictationInterrupted(state.status !== "unlocked" ? "locked" : "background");
}

/**
 * The interruption to report when a recorder ended by itself because capture stopped being allowed.
 * The recorder checks its port on every audio frame, so it can stop before the composer's own lock
 * and background check runs; without this the recording would just vanish with no reason given.
 */
export function dictationEndedByInterruption(
  previous: AssistantVoiceState,
  next: AssistantVoiceState,
  state: { status: string; appState: string },
  promptCovering: () => boolean,
): DictationInterrupted | null {
  if (next !== "idle" || previous === "idle") return null;
  return captureAllowed(state, promptCovering) ? null : dictationInterruption(state);
}

export type DictationBlock = "no-computer" | "update" | "busy";
export type DictationView = {
  /** Accessible action label key; the screen translates it. */
  action: "start" | "stop" | "preparing" | "transcribing" | "no-computer" | "update" | "busy";
  disabled: boolean;
  busy: boolean;
  active: boolean;
};

/**
 * What the dictation button offers. A blocked state keeps the button visible and disabled so the
 * reason stays discoverable; an active recording can always be stopped.
 */
export function dictationView(phase: AssistantVoiceState, block: DictationBlock | null, locked: boolean): DictationView {
  if (phase === "recording") return { action: "stop", disabled: false, busy: false, active: true };
  if (phase === "preparing") return { action: "preparing", disabled: true, busy: true, active: false };
  if (phase === "transcribing") return { action: "transcribing", disabled: true, busy: true, active: false };
  if (block) return { action: block, disabled: true, busy: false, active: false };
  return { action: "start", disabled: locked || phase !== "idle", busy: false, active: false };
}

/**
 * Whether a dimmed microphone still answers a tap by naming why it is blocked (no computer, an
 * update, another voice session). A microphone that is only waiting for a send or upload to finish
 * has no reason to name: its label is just "Dictate message", so it stays plainly disabled.
 */
export function dictationExplainsBlock(view: DictationView): boolean {
  return view.disabled && !view.busy && !view.active && view.action !== "start";
}

/**
 * Capability gate: the chosen engine must be offered by the Host; an unknown capability list is allowed to try.
 * Dictation on the phone (`phone`) needs no Host voice capability, only the composer's computer connection.
 */
export function dictationBlock(input: { connected: boolean; capabilities: readonly string[] | undefined; engine: TranscriptionEngine; phone?: boolean; otherVoiceActive: boolean }): DictationBlock | null {
  if (!input.connected) return "no-computer";
  if (input.phone) return input.otherVoiceActive ? "busy" : null;
  const needed = input.engine === "local" ? "voice.local.v1" : "voice.cloud.v1";
  if (input.capabilities && !input.capabilities.includes(needed)) return "update";
  return input.otherVoiceActive ? "busy" : null;
}
