import { expect, it } from "vitest";
import { readingProgressPercent } from "./section-progress-model";

it("reports reading progress without overscroll or unmeasured layout affecting it", () => {
  expect(readingProgressPercent(0, 0, 0)).toBe(0);
  expect(readingProgressPercent(-10, 400, 800)).toBe(0);
  expect(readingProgressPercent(100, 400, 800)).toBe(25);
  expect(readingProgressPercent(450, 400, 800)).toBe(100);
  expect(readingProgressPercent(0, 400, 300)).toBe(100);
});
