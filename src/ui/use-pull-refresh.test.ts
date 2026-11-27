// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PULL_REFRESH_MIN_MS, usePullRefresh } from "./use-pull-refresh";

let root: Root;
let state: ReturnType<typeof usePullRefresh>;
function Probe({ refresh }: { refresh: () => unknown }) {
  state = usePullRefresh(refresh);
  return null;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); });

it("stays quiet on rerenders and tracks only one user-requested refresh", async () => {
  let finish!: () => void;
  const refresh = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  await act(async () => root.render(createElement(Probe, { refresh })));
  await act(async () => root.render(createElement(Probe, { refresh })));
  expect(state.refreshing).toBe(false);
  let completion!: Promise<void>;
  await act(async () => { completion = state.onRefresh(); void state.onRefresh(); });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(state.refreshing).toBe(true);
  await act(async () => { finish(); await completion; });
  expect(state.refreshing).toBe(false);
});

it("releases feedback after failure so the user can retry", async () => {
  const refresh = vi.fn().mockRejectedValue(new Error("offline"));
  await act(async () => root.render(createElement(Probe, { refresh })));
  await act(async () => { await state.onRefresh(); });
  expect(state.refreshing).toBe(false);
  await act(async () => { await state.onRefresh(); });
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("holds a fast refresh's indicator for the minimum so the native control can dismiss cleanly", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  try {
    const refresh = vi.fn().mockResolvedValue(undefined);
    await act(async () => root.render(createElement(Probe, { refresh })));
    let completion!: Promise<void>;
    await act(async () => { completion = state.onRefresh(); });
    expect(state.refreshing).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(PULL_REFRESH_MIN_MS - 1); });
    expect(state.refreshing).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); await completion; });
    expect(state.refreshing).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});
