import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) }, StyleSheet: { absoluteFill: {} }, Image: "Image", View: "View" }));

import { shownFrame } from "./sprite-player";

describe("sprite frame choice", () => {
  it("shows the frame the loop is on", () => {
    expect(shownFrame([0, 4, 7], 0)).toBe(0);
    expect(shownFrame([0, 4, 7], 2)).toBe(7);
  });
  it("rests on the first frame when there is no loop or step, so a scene is never blank", () => {
    expect(shownFrame(undefined, 3)).toBe(0);
    expect(shownFrame([0, 4], 5)).toBe(0);
    expect(shownFrame([Number.NaN], 0)).toBe(0);
    expect(shownFrame([-1], 0)).toBe(0);
    expect(shownFrame([2.5], 0)).toBe(0);
  });
});
