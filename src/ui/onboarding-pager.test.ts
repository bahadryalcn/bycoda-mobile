import { expect, it } from "vitest";
import { pageAtOffset } from "./onboarding-page-offset";

it("rounds a resting offset to the nearest page", () => {
  expect(pageAtOffset(0, 390, 3)).toBe(0);
  expect(pageAtOffset(390, 390, 3)).toBe(1);
  expect(pageAtOffset(600, 390, 3)).toBe(2);
});

it("clamps overscroll and ignores an unmeasured width", () => {
  expect(pageAtOffset(-80, 390, 3)).toBe(0);
  expect(pageAtOffset(2000, 390, 3)).toBe(2);
  expect(pageAtOffset(500, 0, 3)).toBe(0);
});
