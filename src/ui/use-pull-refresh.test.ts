// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { usePullRefresh } from "./use-pull-refresh";

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
