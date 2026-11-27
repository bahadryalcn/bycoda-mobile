import { PHONE_DICTATION_MS } from "./phone-dictation";

/**
 * Longest single dictation on the computer: one utterance must fit one Host frame
 * (`MAX_UTTERANCE_SAMPLES` of 16 kHz PCM in assistant-voice), so the recorder finishes on its own
 * after this many milliseconds. Kept as a literal so this module stays free of the voice engine;
 * a test holds the two together.
 */
export const DICTATION_LIMIT_MS = 22_000;

/** The limit the recorder in use stops at: the phone's own recognizer has its own. */
export function dictationLimitMs(phone: boolean): number {
  return phone ? PHONE_DICTATION_MS : DICTATION_LIMIT_MS;
}

/** Steps the meter shows; finer changes are invisible on five short bars and would only re-render it. */
const LEVEL_STEPS = 12;

/**
 * The microphone level of one recorder, read only by its meter. It changes many times a second, so it
 * lives outside React state: the composer that owns the recorder does not re-render with it.
 */
export type LevelSignal = {
  get(): number;
  set(value: number): void;
  subscribe(listener: () => void): () => void;
};

export function createLevelSignal(): LevelSignal {
  let level = 0;
  const listeners = new Set<() => void>();
  return {
    get: () => level,
    set(value) {
      const next = Number.isFinite(value) ? Math.round(Math.max(0, Math.min(1, value)) * LEVEL_STEPS) / LEVEL_STEPS : 0;
      if (next === level) return;
      level = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

/** Live text read by one view; the owner of the recorder does not re-render when it changes. */
export type LiveText = {
  get(): string;
  subscribe(listener: () => void): () => void;
};
export type TextSignal = LiveText & { set(value: string): void };

/**
 * What the phone's recognizer has heard so far. Partial results arrive many times a second, so like the
 * level they live outside React state and only the preview that reads them re-renders.
 */
export function createTextSignal(): TextSignal {
  let text = "";
  const listeners = new Set<() => void>();
  return {
    get: () => text,
    set(value) {
      if (value === text) return;
      text = value;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

/** "0:07" for a duration; dictation never reaches an hour. */
export function dictationClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Bar heights (0–1) of the five-bar meter: the middle bar leads, the outer bars follow at a fraction. */
export function dictationBars(level: number): number[] {
  const value = Math.max(0, Math.min(1, level));
  return [0.45, 0.75, 1, 0.75, 0.45].map(weight => 0.2 + 0.8 * value * weight);
}

/** Bars of the scrolling recording waveform; the newest sample enters at the end. */
export const WAVEFORM_BARS = 28;

/**
 * Appends one level sample to the waveform history, keeping the latest `count` values. The history
 * starts filled with silence, so the bars never jump in from an empty row.
 */
export function pushWaveform(history: readonly number[], level: number, count = WAVEFORM_BARS): number[] {
  const value = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  const padded = history.length >= count ? history.slice(history.length - count + 1) : [...Array(count - 1 - history.length).fill(0), ...history];
  return [...padded, value];
}

/** Whole seconds left before the recorder stops on its own, only within the final `warnMs`; otherwise null. */
export function dictationRemaining(elapsedMs: number, limitMs: number, warnMs = 5000): number | null {
  const left = limitMs - elapsedMs;
  if (!(left <= warnMs)) return null;
  return Math.max(0, Math.ceil(left / 1000));
}
