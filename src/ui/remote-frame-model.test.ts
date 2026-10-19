import { describe, expect, it } from "vitest";
import { framePoint } from "./remote-frame-model";

describe("remote screen coordinates", () => {
  it("maps a scaled phone or browser frame without losing its coordinate space", () => {
    expect(framePoint(160, 90, { width: 320, height: 180 }, { width: 1280, height: 720 }))
      .toEqual({ x: 640, y: 360 });
    expect(framePoint(320, 180, { width: 320, height: 180 }, { width: 1280, height: 720 }))
      .toEqual({ x: 1279, y: 719 });
  });
  it("rejects missing layout measurements and touches outside the visible frame", () => {
    expect(framePoint(1, 1, { width: 0, height: 0 }, { width: 1280, height: 720 })).toBeUndefined();
    expect(framePoint(-1, 1, { width: 320, height: 180 }, { width: 1280, height: 720 })).toBeUndefined();
    expect(framePoint(321, 1, { width: 320, height: 180 }, { width: 1280, height: 720 })).toBeUndefined();
  });
});
