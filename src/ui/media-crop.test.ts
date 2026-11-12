import { expect, it, vi } from "vitest";
vi.mock("expo-image-manipulator", () => ({ ImageManipulator: {}, SaveFormat: {} }));
import { initialCrop, moveCrop, resizeCrop, toPixelCrop } from "./media-crop";
it("starts fixed presets centred with the exact pixel ratio", () => {
  const rect = initialCrop("1:1", 2);
  expect((rect.w * 2) / rect.h).toBeCloseTo(1);
  expect(rect.x + rect.w / 2).toBeCloseTo(0.5);
  expect(rect.y + rect.h).toBeLessThanOrEqual(1);
  const wide = initialCrop("16:9", 0.5);
  expect((wide.w * 0.5) / wide.h).toBeCloseTo(16 / 9);
  expect(wide.x).toBeGreaterThanOrEqual(0);
});
it("keeps moves inside the image", () => {
  const rect = moveCrop({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 5, -5);
  expect(rect).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
});
it("resizes free freely and fixed ratios proportionally within bounds", () => {
  const base = { x: 0.1, y: 0.1, w: 0.3, h: 0.3 };
  expect(resizeCrop(base, 0.2, 0.1, "free", 1)).toMatchObject({ w: 0.5, h: 0.4 });
  const fixed = resizeCrop(base, 5, 0, "4:3", 1);
  expect(fixed.x + fixed.w).toBeLessThanOrEqual(1.0000001);
  expect(fixed.y + fixed.h).toBeLessThanOrEqual(1.0000001);
  expect(fixed.w / fixed.h).toBeCloseTo(4 / 3);
  expect(resizeCrop(base, -5, -5, "free", 1)).toMatchObject({ w: 0.1, h: 0.1 });
});
it("rounds to a valid pixel box", () => {
  expect(toPixelCrop({ x: 0.999, y: 0.999, w: 0.5, h: 0.5 }, 100, 50)).toEqual({ originX: 99, originY: 49, width: 1, height: 1 });
  expect(toPixelCrop({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 }, 200, 100)).toEqual({ originX: 20, originY: 20, width: 100, height: 50 });
});
