import { expect, it } from "vitest";
import { assistantWindowBounds, clampAssistantWindow, normalizeAssistantWindow, restoreAssistantWindow, readAssistantWindowPosition } from "./assistant-window-geometry";
it("clamps free drops above keyboard and dock and inside safe edges", () => {
  const bounds = assistantWindowBounds({ width: 390, height: 844, windowWidth: 300, windowHeight: 160, top: 24, bottom: 34, left: 0, right: 0, bottomInset: 88, keyboardHeight: 0 });
  expect(clampAssistantWindow({ x: -900, y: 9999 }, bounds)).toEqual({ x: 8, y: 554 });
  const keyboard = assistantWindowBounds({ width: 390, height: 844, windowWidth: 300, windowHeight: 160, top: 24, bottom: 34, left: 0, right: 0, bottomInset: 88, keyboardHeight: 300 });
  expect(clampAssistantWindow({ x: 9999, y: 9999 }, keyboard)).toEqual({ x: 82, y: 376 });
});
it("retains relative placement through rotation, window resizing and large text", () => {
  const portrait = { left: 8, right: 82, top: 32, bottom: 554 }, landscape = { left: 40, right: 480, top: 8, bottom: 100 };
  const relative = normalizeAssistantWindow({ x: 45, y: 293 }, portrait);
  expect(relative).toEqual({ x: 0.5, y: 0.5 });
  expect(restoreAssistantWindow(relative, landscape)).toEqual({ x: 260, y: 54 });
  expect(restoreAssistantWindow(relative, portrait)).toEqual({ x: 45, y: 293 });
});
it("handles collapsed bounds and rejects corrupt persisted positions", () => {
  const bounds = assistantWindowBounds({ width: 200, height: 180, windowWidth: 320, windowHeight: 300, top: 24, bottom: 24, left: 0, right: 0, bottomInset: 88, keyboardHeight: 150 });
  expect(bounds.right).toBe(bounds.left); expect(bounds.bottom).toBe(bounds.top);
  expect(normalizeAssistantWindow({ x: 1000, y: 1000 }, bounds)).toEqual({ x: 0, y: 0 });
  for (const value of [null, "oops", "null", '{"x":null,"y":0}', '{"x":1,"y":"0"}', '{"x":1e999,"y":0}']) expect(readAssistantWindowPosition(value)).toBeUndefined();
  expect(readAssistantWindowPosition('{"x":2,"y":-2}')).toEqual({ x: 1, y: 0 });
});
