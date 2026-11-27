import { processDictationText } from "../../../../src/features/voice/model/dictationProcessing";
import type { VoicePort } from "../assistant/assistant-voice";
import type { DictationCleanup, DictationPreferences } from "../voice-settings/dictation-preferences";

/**
 * Host capability: this computer runs the opt-in dictation cleanup (`voice.dictation.process`) for its
 * paired phone. An older Host keeps cleanup to its own desktop, so the phone neither offers nor calls it.
 */
export const DICTATION_CLEANUP_CAPABILITY = "voice.dictation.cleanup.v1";
/** The Host gives Codex 30 s for a cleanup; the phone waits a little longer, then keeps the recognized text. */
export const DICTATION_CLEANUP_TIMEOUT_MS = 40_000;
/** The Host's cleanup input and output bound. */
const MAX_CLEANUP_TEXT = 16_000;

type RecognizerPreferences = Pick<DictationPreferences, "dictationLanguage" | "dictationSilenceFilter"> & { whisperModel?: "small" | "turbo" };

/**
 * What dictation adds to the computer's recognizer start (`voice.local.start` config), as the desktop does:
 * a chosen language forces Whisper's language, and the silence filter (Whisper's voice detection) can be
 * turned off. Host defaults (Automatic, filter on, automatic model) are omitted, so the same choice keeps
 * the same Host runtime and an unchanged phone shares the recognizer it shared before.
 */
export function dictationRecognizerConfig(preferences: RecognizerPreferences): Record<string, unknown> {
  return {
    ...(preferences.whisperModel ? { whisperModel: preferences.whisperModel } : {}),
    ...(preferences.dictationLanguage !== "auto" ? { dictationLanguage: preferences.dictationLanguage } : {}),
    ...(preferences.dictationSilenceFilter === false ? { dictationSilenceFilter: false } : {}),
  };
}

/**
 * The language sent with each recording, as the desktop's `dictationLanguage(settings, locale)`: a chosen
 * language always; with Automatic, the owner's language as a hint for Whisper on the computer only, because
 * cloud engines treat a language as the output language and would translate other speech into it.
 */
export function dictationPhraseLanguage(chosen: string, ownerLanguage: string | undefined, cloud: boolean): string | undefined {
  if (chosen !== "auto") return chosen;
  return cloud ? undefined : ownerLanguage;
}

type PolishPreferences = Pick<DictationPreferences, "dictationDictionary" | "dictationRemoveFillers" | "dictationLanguage"> & { dictationCleanup: Pick<DictationCleanup, "correctionCue"> };

/**
 * Custom words and filler removal on the recognized text only, never the surrounding draft (desktop
 * `processDictationText`). A failure keeps the recognized text: speech is never lost to polishing.
 */
export function polishDictation(text: string, preferences: PolishPreferences, spokenLanguage?: string): string {
  try {
    return processDictationText(text, {
      dictionary: preferences.dictationDictionary,
      removeFillers: preferences.dictationRemoveFillers,
      language: preferences.dictationLanguage !== "auto" ? preferences.dictationLanguage : spokenLanguage,
      correctionCue: preferences.dictationCleanup.correctionCue,
    }).trim();
  } catch {
    return text.trim();
  }
}

/** `voice.dictation.process` parameters, as the desktop sends them; empty optional text is omitted. */
export function dictationCleanupParams(runId: string, text: string, cleanup: DictationCleanup): Record<string, unknown> {
  return {
    runId,
    text,
    ...(cleanup.model.trim() ? { model: cleanup.model.trim() } : {}),
    ...(cleanup.instructions.trim() ? { instructions: cleanup.instructions } : {}),
    ...(cleanup.correctionCue.trim() ? { correctionCue: cleanup.correctionCue.trim() } : {}),
    ...(cleanup.translateToEnglish ? { translateToEnglish: true } : {}),
  };
}

export type DictationProcessorDependencies = {
  preferences(): DictationPreferences;
  /** A version 4 UUID: the Host's cleanup run identity, also used to cancel it. */
  createId(): string | Promise<string>;
  /** The owner's language, used for filler words while the dictation language is Automatic. */
  spokenLanguage?(): string | undefined | Promise<string | undefined>;
};
/** Captured when a recording starts: the computer it goes to and whether that computer can clean up text. */
export type DictationProcessContext = { port: VoicePort; cleanupAvailable: boolean };

/**
 * Turns one recognized recording into the text the owner receives: custom words and filler removal on the
 * phone, then, when the owner turned it on and the computer offers it, Codex cleanup on the computer
 * (`voice.dictation.process` with its run id). Discarding the recording cancels a cleanup in flight
 * (`voice.dictation.cancel`). A cleanup that fails, times out or returns nothing keeps the polished text.
 */
export class DictationProcessor {
  private generation = 0;
  private active?: { port: VoicePort; runId: string };
  constructor(private readonly dependencies: DictationProcessorDependencies) {}

  /** The text to insert, or `null` when the recording was discarded meanwhile. */
  async process(context: DictationProcessContext, text: string): Promise<string | null> {
    const generation = this.generation;
    const preferences = this.dependencies.preferences();
    const spoken = preferences.dictationRemoveFillers && preferences.dictationLanguage === "auto"
      ? await Promise.resolve(this.dependencies.spokenLanguage?.()).catch(() => undefined) : undefined;
    if (generation !== this.generation) return null;
    const polished = polishDictation(text, preferences, spoken);
    const cleanup = preferences.dictationCleanup;
    if (!polished || !cleanup.enabled || !context.cleanupAvailable || polished.length > MAX_CLEANUP_TEXT || !context.port.current()) return polished;
    let run: { port: VoicePort; runId: string } | undefined;
    try {
      run = { port: context.port, runId: await this.dependencies.createId() };
      if (generation !== this.generation) return null;
      this.active = run;
      const result = await context.port.request<{ text?: unknown }>("voice.dictation.process", dictationCleanupParams(run.runId, polished, cleanup),
        { retry: false, timeoutMs: DICTATION_CLEANUP_TIMEOUT_MS });
      if (generation !== this.generation) return null;
      const cleaned = typeof result?.text === "string" ? result.text.trim() : "";
      if (cleaned && cleaned.length <= MAX_CLEANUP_TEXT) return cleaned;
    } catch {
      if (generation !== this.generation) return null;
      // A cleanup that timed out may still run on the computer; nothing will read its result.
      if (run) cancelRun(run);
    } finally {
      if (run && this.active === run) this.active = undefined;
    }
    return polished;
  }

  /** Discards the recording in progress: a cleanup still running is cancelled and its text is never used. */
  cancel() {
    this.generation++;
    const run = this.active;
    this.active = undefined;
    if (run) cancelRun(run);
  }
}

function cancelRun(run: { port: VoicePort; runId: string }) {
  try {
    void Promise.resolve(run.port.request("voice.dictation.cancel", { runId: run.runId }, { retry: false, timeoutMs: 5000 })).catch(() => {});
  } catch { /* the connection is gone; the Host drops the run with it */ }
}
