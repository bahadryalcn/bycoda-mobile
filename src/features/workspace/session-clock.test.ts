// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: () => ({ remove: () => undefined }) },
}));
import {
  createSessionClock,
  nextSnoozeBoundary,
  SESSION_CLOCK_BEAT_MS,
  useClockLabel,
  useSnoozeNow,
  type SessionClockEnv,
} from "./session-clock";

const minutes = (ms: number) => Math.floor(ms / 60_000);

function fakeEnv(start: number) {
  const state = { now: start, active: true, onActive: undefined as (() => void) | undefined, timers: 0 };
  let beat: (() => void) | undefined;
  const env: SessionClockEnv = {
    now: () => state.now,
    setInterval: (run) => { state.timers++; beat = run; return run; },
    clearInterval: () => { state.timers--; beat = undefined; },
    observeActive: (onActive) => { state.onActive = onActive; return () => { state.onActive = undefined; }; },
    isActive: () => state.active,
  };
  return { env, state, beat: () => beat?.() };
}

it("runs one shared timer only while rows listen and pauses in the background", () => {
  const { env, state, beat } = fakeEnv(0);
  const clock = createSessionClock(env);
  const first = vi.fn();
  const second = vi.fn();
  const stopFirst = clock.subscribe(first);
  const stopSecond = clock.subscribe(second);
  expect(state.timers).toBe(1);
  beat();
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
  state.active = false;
  beat();
  expect(first).toHaveBeenCalledTimes(1);
  stopFirst();
  expect(state.timers).toBe(1);
  stopSecond();
  expect(state.timers).toBe(0);
  expect(state.onActive).toBeUndefined();
});

it("notifies immediately when the app returns to the foreground", () => {
  const { env, state } = fakeEnv(0);
  const clock = createSessionClock(env);
  const listener = vi.fn();
  clock.subscribe(listener);
  state.active = false;
  state.onActive?.();
  expect(listener).toHaveBeenCalledTimes(1);
});

it("finds the earliest snooze wake-up that has not passed", () => {
  expect(nextSnoozeBoundary([undefined, null, 100, 400, 250], 100)).toBe(250);
  expect(nextSnoozeBoundary([50, 100], 100)).toBeUndefined();
  expect(nextSnoozeBoundary([], 100)).toBeUndefined();
});

let root: ReturnType<typeof createRoot>;
let node: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  node = document.createElement("div");
  root = createRoot(node);
});
afterEach(async () => {
  await act(() => root.unmount());
  node.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("re-renders only the rows whose relative label changed on a beat", async () => {
  // Start at the `fresh` stamp, so neither row's age is negative (a future stamp floors to -1m).
  const fake = fakeEnv(30_000);
  const clock = createSessionClock(fake.env);
  const renders = { old: 0, fresh: 0 };
  const label = (since: number) => (now: number) => `${minutes(now - since)}m`;
  // Row `old` changes every minute after its stamp; `fresh` was just stamped 59 s before the next minute.
  function Row({ id, since }: { id: "old" | "fresh"; since: number }) {
    renders[id]++;
    return createElement("span", { id }, useClockLabel(label(since), clock));
  }
  const rows = () => createElement("div", null,
    createElement(Row, { id: "old", since: 0 }),
    createElement(Row, { id: "fresh", since: 30_000 }));
  await act(() => root.render(rows()));
  expect(node.querySelector("#old")?.textContent).toBe("0m");
  const before = { ...renders };
  // 59.9 s: neither label crossed a minute, so the beat re-renders nothing.
  fake.state.now = 59_900;
  await act(() => fake.beat());
  expect({ ...renders }).toEqual(before);
  // 60.0 s: only the older stamp reached one minute; the other row keeps its output and render count.
  fake.state.now = 60_000;
  await act(() => fake.beat());
  expect(node.querySelector("#old")?.textContent).toBe("1m");
  expect(node.querySelector("#fresh")?.textContent).toBe("0m");
  expect(renders.old).toBe(before.old + 1);
  expect(renders.fresh).toBe(before.fresh);
  expect(SESSION_CLOCK_BEAT_MS).toBeLessThanOrEqual(60_000);
});

it("moves the screen clock only when a snooze ends, not on every second", async () => {
  vi.setSystemTime(1_000_000);
  const seen: number[] = [];
  let wakes: (number | undefined)[] = [1_030_000];
  function Screen({ active }: { active: boolean }) {
    const now = useSnoozeNow(active, wakes);
    seen.push(now);
    return null;
  }
  await act(() => root.render(createElement(Screen, { active: true })));
  const initial = seen.length;
  await act(() => vi.advanceTimersByTimeAsync(29_000));
  expect(seen.length).toBe(initial);
  await act(() => vi.advanceTimersByTimeAsync(1_000));
  expect(seen.at(-1)).toBe(1_030_000);
  const afterWake = seen.length;
  wakes = [undefined];
  await act(() => root.render(createElement(Screen, { active: true })));
  await act(() => vi.advanceTimersByTimeAsync(120_000));
  // The extra entry is the explicit re-render above; a quiet list never ticks.
  expect(seen.length).toBe(afterWake + 1);
});

it("waits while the screen is inactive and catches up once it returns after a gap", async () => {
  vi.setSystemTime(1_000_000);
  const seen: number[] = [];
  const wakes = [1_020_000];
  function Screen({ active }: { active: boolean }) {
    seen.push(useSnoozeNow(active, wakes));
    return null;
  }
  await act(() => root.render(createElement(Screen, { active: false })));
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(new Set(seen)).toEqual(new Set([1_000_000]));
  await act(() => root.render(createElement(Screen, { active: true })));
  expect(seen.at(-1)).toBe(1_060_000);
});
