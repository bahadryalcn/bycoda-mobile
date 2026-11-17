import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create, useStore } from "zustand";

export type TranscriptionEngine = "local" | "cloud";
export const MIC_KINDS = ["wired", "bluetooth", "builtin", "carplay"] as const;
export type MicKind = (typeof MIC_KINDS)[number];
/** Phone-local voice preferences; the Host decides whether each engine is actually available. */
export type VoicePreferences = { engine: TranscriptionEngine; micOrder: MicKind[] };
export const defaultVoicePreferences: VoicePreferences = { engine: "local", micOrder: ["wired", "bluetooth", "builtin", "carplay"] };
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
  return { engine: data.engine === "cloud" ? "cloud" : "local", micOrder: normalizeMicOrder(data.micOrder) };
}
export function moveMic(order: MicKind[], kind: MicKind, delta: -1 | 1): MicKind[] {
  const from = order.indexOf(kind), to = from + delta;
  if (from < 0 || to < 0 || to >= order.length) return order;
  const next = [...order];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

export function createVoicePreferenceStore(storage: Pick<typeof AsyncStorage, "getItem" | "setItem">) {
  let loading: Promise<void> | undefined;
  let writes: Promise<unknown> = Promise.resolve();
  let loaded = false;
  return create<{
    preferences: VoicePreferences;
    hydrated: boolean;
    hydrate(): Promise<void>;
    update(patch: Partial<VoicePreferences>): Promise<void>;
  }>((set, get) => ({
    preferences: defaultVoicePreferences,
    hydrated: false,
    hydrate() {
      if (loaded) return Promise.resolve();
      loading ??= storage.getItem(storageKey)
        .then((raw) => { loaded = true; set({ preferences: normalizeVoicePreferences(raw ? JSON.parse(raw) : undefined) }); })
        // An unreadable store keeps defaults; the next successful read retries.
        .catch(() => undefined)
        .finally(() => { loading = undefined; set({ hydrated: true }); });
      return loading;
    },
    async update(patch) {
      await get().hydrate();
      // Never overwrite stored values that could not be read.
      if (!loaded) return;
      const next = normalizeVoicePreferences({ ...get().preferences, ...patch });
      set({ preferences: next });
      const snapshot = JSON.stringify(next);
      const write = writes.catch(() => undefined).then(() => storage.setItem(storageKey, snapshot));
      writes = write;
      await write;
    },
  }));
}
export const voicePreferences = createVoicePreferenceStore(AsyncStorage);
export function useVoicePreferences() {
  const preferences = useStore(voicePreferences, (state) => state.preferences);
  const hydrated = useStore(voicePreferences, (state) => state.hydrated);
  // Reads the stored preferences once per mount; the store ignores repeat calls.
  useEffect(() => { void voicePreferences.getState().hydrate(); }, []);
  return { preferences, hydrated };
}
