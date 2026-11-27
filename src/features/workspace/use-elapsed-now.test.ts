import { expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: () => ({ remove: () => undefined }) },
}));
import { createSessionClock, type SessionClockEnv } from "./session-clock";
import { createElapsedClock, ELAPSED_BEAT_MS } from "./use-elapsed-now";

it("shares one second beat across labels and stops it when nobody counts", () => {
  const state = { now: 1_000, active: true, timers: 0, ms: 0 };
  let beat: (() => void) | undefined;
  const env: SessionClockEnv = {
    now: () => state.now,
    setInterval: (run, ms) => { state.timers++; state.ms = ms; beat = run; return run; },
    clearInterval: () => { state.timers--; beat = undefined; },
    observeActive: () => () => undefined,
    isActive: () => state.active,
  };
  const clock = createElapsedClock(createSessionClock(env, ELAPSED_BEAT_MS));
  state.now = 50_000;
  const first = vi.fn(), second = vi.fn();
  const stopFirst = clock.subscribe(first);
  // A label that starts counting begins from the real time.
  expect(clock.snapshot()).toBe(50_000);
  const stopSecond = clock.subscribe(second);
  expect(state.timers).toBe(1);
  expect(state.ms).toBe(1000);
  state.now = 51_000;
  beat?.();
  expect(clock.snapshot()).toBe(51_000);
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
  // In the background the beat is silent.
  state.active = false;
  state.now = 52_000;
  beat?.();
  expect(first).toHaveBeenCalledTimes(1);
  stopFirst();
  stopSecond();
  expect(state.timers).toBe(0);
});
