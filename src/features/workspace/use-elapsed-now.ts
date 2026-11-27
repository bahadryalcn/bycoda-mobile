import { useSyncExternalStore } from "react";
import { createSessionClock } from "./session-clock";

/** Elapsed labels count seconds. */
export const ELAPSED_BEAT_MS = 1000;

/**
 * One shared second beat for every live elapsed label. It runs only while someone is counting and the
 * app is in front, and catches up at once on return, so N running agents cost one timer, not N.
 */
export function createElapsedClock(clock = createSessionClock(undefined, ELAPSED_BEAT_MS)) {
  let current = clock.now();
  let subscribers = 0;
  return {
    snapshot: () => current,
    subscribe(listener: () => void) {
      // The first label after a quiet spell starts from the real time, not the last beat.
      if (subscribers++ === 0) current = clock.now();
      const stop = clock.subscribe(() => {
        current = clock.now();
        listener();
      });
      return () => {
        subscribers--;
        stop();
      };
    },
  };
}

const elapsedClock = createElapsedClock();
const idle = () => () => undefined;

/** Wall clock that ticks once a second while `active`, so elapsed labels stay live. */
export function useElapsedNow(active: boolean, clock = elapsedClock): number {
  return useSyncExternalStore(active ? clock.subscribe : idle, clock.snapshot, clock.snapshot);
}
