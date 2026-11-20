import { useEffect, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";

/** Relative labels count whole minutes, so a coarse shared beat keeps them within seconds. */
export const SESSION_CLOCK_BEAT_MS = 30_000;
/** Longest delay the platform timers accept; a farther wake re-arms when this one fires. */
const MAX_TIMER_MS = 2 ** 31 - 1;
/** A return from the background after this long refreshes the screen clock once. */
const STALE_CLOCK_MS = 5_000;

export type SessionClockEnv = {
  now(): number;
  setInterval(run: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  /** Reports foreground changes; the returned function stops listening. */
  observeActive(onActive: () => void): () => void;
  isActive(): boolean;
};

const platformEnv: SessionClockEnv = {
  now: () => Date.now(),
  setInterval: (run, ms) => setInterval(run, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  observeActive: (onActive) => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") onActive();
    });
    return () => subscription.remove();
  },
  isActive: () => !AppState.currentState || AppState.currentState === "active",
};

/**
 * One beat for every row on screen. Nothing runs without a subscriber or in the background;
 * the OS may freeze timers away, so returning to the foreground notifies at once.
 */
export function createSessionClock(env: SessionClockEnv = platformEnv) {
  const listeners = new Set<() => void>();
  let timer: unknown;
  let stopObserving: (() => void) | undefined;
  const notify = () => listeners.forEach((listener) => listener());
  const startTimer = () => {
    if (timer === undefined && env.isActive()) timer = env.setInterval(() => (env.isActive() ? notify() : undefined), SESSION_CLOCK_BEAT_MS);
  };
  const stop = () => {
    if (timer !== undefined) env.clearInterval(timer);
    timer = undefined;
    stopObserving?.();
    stopObserving = undefined;
  };
  return {
    now: () => env.now(),
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        stopObserving = env.observeActive(() => {
          startTimer();
          notify();
        });
        startTimer();
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) stop();
      };
    },
  };
}

export const sessionClock = createSessionClock();

/**
 * A label derived from the wall clock. The snapshot is the text itself, so only a row whose
 * label actually changed re-renders on a beat; unrelated rows and their selection are untouched.
 */
export function useClockLabel(format: (now: number) => string, clock = sessionClock): string {
  const read = () => format(clock.now());
  return useSyncExternalStore(clock.subscribe, read, read);
}

/** The earliest wake-up strictly after `now`, if any session is still snoozed. */
export function nextSnoozeBoundary(
  wakes: readonly (number | null | undefined)[],
  now: number,
): number | undefined {
  let next: number | undefined;
  for (const wake of wakes) {
    if (typeof wake === "number" && wake > now && (next === undefined || wake < next)) next = wake;
  }
  return next;
}

/**
 * A `now` for shelf and filter decisions that only changes when a snooze expires or the app
 * returns after a long absence, so a list does not re-render on a timer it does not need.
 */
export function useSnoozeNow(active: boolean, wakes: readonly (number | null | undefined)[]): number {
  const [now, setNow] = useState(() => Date.now());
  const next = nextSnoozeBoundary(wakes, now);
  // Returning to the foreground: timers may have been frozen, so catch up once after a real gap.
  useEffect(() => {
    if (active) setNow((previous) => (Date.now() - previous > STALE_CLOCK_MS ? Date.now() : previous));
  }, [active]);
  // Wake exactly when the next snooze ends; `now` in deps re-arms a wait clamped to the timer limit.
  useEffect(() => {
    if (!active || next === undefined) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(Math.max(next - Date.now(), 0), MAX_TIMER_MS));
    return () => clearTimeout(timer);
  }, [active, next, now]);
  return now;
}
