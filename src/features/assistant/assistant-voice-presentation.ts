import type { AssistantCallPhase } from "./assistant-call-loop";

export type AssistantOrbState = "idle" | "listening" | "thinking" | "speaking" | "muted" | "error";
export const assistantVoiceRequested = (value: string | string[] | undefined) => value === "1";

export function assistantOrbState(phase: AssistantCallPhase | "starting", muted: boolean, error: unknown): AssistantOrbState {
  if (error) return "error";
  if (phase === "starting" || phase === "sending") return "thinking";
  if (phase === "listening" && muted) return "muted";
  return phase;
}

/**
 * The step of the call chain in flight: phone microphone → transcription on the connected computer →
 * assistant reply → speech synthesis on the computer → playback on the phone. A failure keeps the step it
 * happened in, so the owner learns where the chain broke.
 */
export type AssistantVoiceStage = "connect" | "microphone" | "transcription" | "reply" | "synthesis" | "playback";
type Copy = (tr: string, en: string, values?: Record<string, string | number>) => string;

/** Where a step runs, named by device, e.g. "Transcription on Office PC". */
export function assistantVoiceStageLabel(stage: AssistantVoiceStage, computer: string, copy: Copy): string {
  switch (stage) {
    case "connect": return copy("{p0} ile ses bağlantısı", "Voice line to {p0}", { p0: computer });
    case "microphone": return copy("Bu telefonun mikrofonu", "This phone's microphone");
    case "transcription": return copy("{p0} üzerinde ses tanıma", "Transcription on {p0}", { p0: computer });
    case "reply": return copy("Asistan yanıtı", "Assistant reply");
    case "synthesis": return copy("{p0} üzerinde ses üretimi", "Speech generated on {p0}", { p0: computer });
    case "playback": return copy("Bu telefonda oynatma", "Playback on this phone");
  }
}

/** The failure title: which step stopped the call. */
export function assistantVoiceFailureTitle(stage: AssistantVoiceStage | undefined, computer: string, copy: Copy): string {
  return stage
    ? copy("Durduğu adım: {p0}", "Stopped at: {p0}", { p0: assistantVoiceStageLabel(stage, computer, copy) })
    : copy("Sesli görüşme kullanılamıyor", "Voice call unavailable");
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
