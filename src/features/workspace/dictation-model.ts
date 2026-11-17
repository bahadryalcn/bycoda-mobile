import type { AssistantVoiceState } from "../assistant/assistant-voice";

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

/** Capability gate: the chosen engine must be offered by the Host; an unknown capability list is allowed to try. */
export function dictationBlock(input: { connected: boolean; capabilities: readonly string[] | undefined; engine: "local" | "cloud"; otherVoiceActive: boolean }): DictationBlock | null {
  if (!input.connected) return "no-computer";
  const needed = input.engine === "cloud" ? "voice.cloud.v1" : "voice.local.v1";
  if (input.capabilities && !input.capabilities.includes(needed)) return "update";
  return input.otherVoiceActive ? "busy" : null;
}
