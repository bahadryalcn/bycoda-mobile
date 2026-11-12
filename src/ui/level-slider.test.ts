import { describe, expect, it } from "vitest";
import { barRatio, stepAt } from "./level-slider-model";

describe("level slider steps", () => {
  it("maps a touch to an integer step and clamps at the ends", () => {
    expect(stepAt(0, 300, 4)).toBe(0);
    expect(stepAt(80, 300, 4)).toBe(1);
    expect(stepAt(299, 300, 4)).toBe(3);
    expect(stepAt(-20, 300, 4)).toBe(0);
    expect(stepAt(900, 300, 4)).toBe(3);
    expect(stepAt(10, 0, 4)).toBe(0);
  });
  it("rises from a stub to a full bar", () => {
    expect(barRatio(3, 4)).toBeCloseTo(1);
    expect(barRatio(0, 4)).toBeLessThan(barRatio(1, 4));
  });
});
