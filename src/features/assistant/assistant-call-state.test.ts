import { expect, it } from "vitest";
import { callLevel } from "./assistant-call-state";

it("keeps the microphone level in visible steps so near-equal samples do not re-render", () => {
  expect(callLevel(0.001)).toBe(0);
  expect(callLevel(0.012)).toBe(callLevel(0.02));
  expect(callLevel(0.5)).toBe(0.5);
  expect(callLevel(1.7)).toBe(1);
  expect(callLevel(-1)).toBe(0);
  expect(callLevel(Number.NaN)).toBe(0);
});
