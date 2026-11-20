// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useNow } from "./use-approvals";

vi.mock("@/state/machines", () => ({}));
vi.mock("@/state/queries", () => ({}));

it("updates a pending card through its deadline and releases the clock afterwards", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  const container = document.createElement("div");
  const root = createRoot(container);
  function Clock() {
    return createElement("span", null, useNow(true, 11_500));
  }
  try {
    await act(async () => root.render(createElement(Clock)));
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(container.textContent).toBe("11000");
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(container.textContent).toBe("11500");
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
