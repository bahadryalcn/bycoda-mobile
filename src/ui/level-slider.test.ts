import { describe, expect, it } from "vitest";
import { barRatio, nudgeStep, shownStep, stepAt } from "./level-slider-model";

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

describe("level slider accessibility increments", () => {
  it("clamps each increment to the scale ends", () => {
    expect(nudgeStep(0, -1, 4)).toBe(0);
    expect(nudgeStep(3, 1, 4)).toBe(3);
    expect(nudgeStep(1, 1, 4)).toBe(2);
    expect(nudgeStep(2, -1, 4)).toBe(1);
  });

  it("builds on the last accepted step while the owner has not caught up", () => {
    // Two quick increments from Low (index 0) while the prop still reads "low".
    const first = nudgeStep(shownStep(undefined, "low", 0), 1, 4);
    const accepted = { from: "low", step: first };
    const second = nudgeStep(shownStep(accepted, "low", 0), 1, 4);
    expect(first).toBe(1);
    expect(second).toBe(2);
    expect(shownStep(accepted, "low", 0)).toBe(1);
  });

  it("reconciles to the prop once the value it was requested from changes", () => {
    const accepted = { from: "low", step: 2 };
    expect(shownStep(accepted, "low", 0)).toBe(2);
    // The owner stored the value: the prop moved, so its own index is authoritative.
    expect(shownStep(accepted, "medium", 1)).toBe(1);
  });

  it("can step back to the committed prop value after a pending request", () => {
    const accepted = { from: "low", step: 2 };
    expect(nudgeStep(shownStep(accepted, "low", 0), -1, 4)).toBe(1);
  });
});
