import type { AssistantCallPhase } from "./assistant-call-loop";

export type AssistantOrbState = "idle" | "listening" | "thinking" | "speaking" | "muted" | "error";
export const assistantVoiceRequested = (value: string | string[] | undefined) => value === "1";

export function assistantOrbState(phase: AssistantCallPhase | "starting", muted: boolean, error: unknown): AssistantOrbState {
  if (error) return "error";
  if (muted || phase === "muted") return "muted";
  if (phase === "starting" || phase === "sending") return "thinking";
  return phase;
}

export function assistantMicrophoneLevel(pcm: Int16Array): number {
  if (!pcm.length) return 0;
  let squares = 0;
  for (const sample of pcm) squares += sample * sample;
  return Math.min(1, Math.sqrt(squares / pcm.length) / 8192);
}

export const TRANSCRIPT_VISIBILITY_KEY = "bycoda.assistantVoice.transcript.v1";
type PreferenceStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> };

/** Device preference only. A late read never replaces a tap; writes retain tap order. */
export class AssistantTranscriptPreference {
  private edited = false;
  private writes: Promise<unknown> = Promise.resolve();
  constructor(private readonly storage: PreferenceStorage) {}
  async load(): Promise<boolean | undefined> {
    try {
      const value = await this.storage.getItem(TRANSCRIPT_VISIBILITY_KEY);
      return this.edited ? undefined : value === "true";
    } catch { return undefined; }
  }
  save(visible: boolean): Promise<unknown> {
    this.edited = true;
    this.writes = this.writes.then(async () => {
      try { await this.storage.setItem(TRANSCRIPT_VISIBILITY_KEY, String(visible)); }
      catch { /* Visibility still works for this session when device storage is unavailable. */ }
    });
    return this.writes;
  }
}
