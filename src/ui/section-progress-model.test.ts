import { expect, it } from "vitest";
import { sectionNavigatorClearance } from "./section-progress-model";

it("reserves the floating pill's height and grows with large text, capped at 2x", () => {
  expect(sectionNavigatorClearance(1)).toBe(72);
  expect(sectionNavigatorClearance(0.8)).toBe(72);
  expect(sectionNavigatorClearance(1.5)).toBe(108);
  expect(sectionNavigatorClearance(3)).toBe(144);
});
