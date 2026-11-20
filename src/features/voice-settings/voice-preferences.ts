import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useStore } from "zustand";
import { createPreferenceStore } from "@/state/preference-store";

export type TranscriptionEngine = "local" | "cloud";
export const MIC_KINDS = ["wired", "bluetooth", "builtin", "carplay"] as const;
export type MicKind = (typeof MIC_KINDS)[number];
/** The assistant's spoken voice, the same engines the desktop offers. */
export const SPEECH_ENGINES = ["supertonic", "voxcpm2", "elevenlabs"] as const;
export type SpeechEngine = (typeof SPEECH_ENGINES)[number];
/** Supertonic ships ten speakers: M1–M5 and F1–F5. */
export const SUPERTONIC_SPEAKERS = ["M1", "M2", "M3", "M4", "M5", "F1", "F2", "F3", "F4", "F5"] as const;
export type SupertonicSpeaker = (typeof SUPERTONIC_SPEAKERS)[number];
/**
 * Phone-local voice preferences; the Host decides whether each engine is actually available.
 * `engine` is where the owner's speech is recognized; `speech` and `speaker` are how the assistant sounds.
 */
export type VoicePreferences = { engine: TranscriptionEngine; micOrder: MicKind[]; speech: SpeechEngine; speaker: SupertonicSpeaker };
export const defaultVoicePreferences: VoicePreferences = { engine: "local", micOrder: ["wired", "bluetooth", "builtin", "carplay"], speech: "supertonic", speaker: "M1" };

/**
 * The speech configuration a call sends to the Host. Built like the desktop's: defaults are omitted, so the
 * same choice on both devices yields the same Host runtime key and they share the loaded models.
 */
export function speechConfig(preferences: Pick<VoicePreferences, "speech" | "speaker">): { natural: true; engine?: SpeechEngine; voiceId?: string } {
  return {
    natural: true,
    ...(preferences.speech !== "supertonic" ? { engine: preferences.speech } : {}),
    ...(preferences.speech === "supertonic" && preferences.speaker !== "M1" ? { voiceId: preferences.speaker } : {}),
  };
}
const storageKey = "bycoda.mobile.voice-preferences.v1";

/** Unknown kinds are dropped, repeats ignored and missing kinds appended in the default order. */
export function normalizeMicOrder(value: unknown): MicKind[] {
  const seen = new Set<MicKind>();
  if (Array.isArray(value)) for (const item of value) if ((MIC_KINDS as readonly unknown[]).includes(item)) seen.add(item as MicKind);
  for (const kind of defaultVoicePreferences.micOrder) seen.add(kind);
  return [...seen];
}
export function normalizeVoicePreferences(value: unknown): VoicePreferences {
  const data = value && typeof value === "object" ? (value as Partial<Record<keyof VoicePreferences, unknown>>) : {};
  return {
    engine: data.engine === "cloud" ? "cloud" : "local",
    micOrder: normalizeMicOrder(data.micOrder),
    speech: (SPEECH_ENGINES as readonly unknown[]).includes(data.speech) ? (data.speech as SpeechEngine) : "supertonic",
    speaker: (SUPERTONIC_SPEAKERS as readonly unknown[]).includes(data.speaker) ? (data.speaker as SupertonicSpeaker) : "M1",
  };
}
/** CarPlay is an iOS car route; Android never reports it, so it is not offered there. */
export function visibleMics(order: MicKind[], os: string | undefined): MicKind[] {
  return os === "ios" ? order : order.filter((kind) => kind !== "carplay");
}

/** Moves among the visible kinds; kinds this platform cannot report keep their place at the end. */
export function moveVisibleMic(order: MicKind[], os: string | undefined, kind: MicKind, delta: -1 | 1): MicKind[] {
  const visible = visibleMics(order, os);
  return [...moveMic(visible, kind, delta), ...order.filter((entry) => !visible.includes(entry))];
}

export function moveMic(order: MicKind[], kind: MicKind, delta: -1 | 1): MicKind[] {
  const from = order.indexOf(kind), to = from + delta;
  if (from < 0 || to < 0 || to >= order.length) return order;
  const next = [...order];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

export function createVoicePreferenceStore(storage: Pick<typeof AsyncStorage, "getItem" | "setItem">) {
  return createPreferenceStore<VoicePreferences>({
    key: storageKey,
    storage,
    defaults: defaultVoicePreferences,
    normalize: normalizeVoicePreferences,
  });
}
export const voicePreferences = createVoicePreferenceStore(AsyncStorage);
export function useVoicePreferences() {
  const preferences = useStore(voicePreferences, (state) => state.preferences);
  const hydrated = useStore(voicePreferences, (state) => state.hydrated);
  const storageError = useStore(voicePreferences, (state) => state.storageError);
  const retry = useStore(voicePreferences, (state) => state.retry);
  // Reads the stored preferences once per mount; the store ignores repeat calls.
  useEffect(() => { void voicePreferences.getState().hydrate(); }, []);
  return { preferences, hydrated, storageError, retry };
}
