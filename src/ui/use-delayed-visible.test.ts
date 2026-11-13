// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDelayedVisible } from "./use-delayed-visible";

let root: Root;
let container: HTMLDivElement;
function Probe({ active }: { active: boolean }) {
  return createElement("span", null, String(useDelayedVisible(250, active)));
}
function render(active: boolean) {
  act(() => root.render(createElement(Probe, { active })));
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("delays each new load even when the placeholder owner stays mounted", () => {
  render(false);
  act(() => vi.advanceTimersByTime(500));
  expect(container.textContent).toBe("false");
  render(true);
  expect(container.textContent).toBe("false");
  act(() => vi.advanceTimersByTime(250));
  expect(container.textContent).toBe("true");
  render(false);
  expect(container.textContent).toBe("false");
  render(true);
  expect(container.textContent).toBe("false");
  act(() => vi.advanceTimersByTime(249));
  expect(container.textContent).toBe("false");
  act(() => vi.advanceTimersByTime(1));
  expect(container.textContent).toBe("true");
});
it("cancels a fast load without leaking its timer into the next load", () => {
  render(true);
  act(() => vi.advanceTimersByTime(200));
  render(false);
  render(true);
  act(() => vi.advanceTimersByTime(50));
  expect(container.textContent).toBe("false");
  act(() => vi.advanceTimersByTime(200));
  expect(container.textContent).toBe("true");
});
