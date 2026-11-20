import { expect, it } from "vitest";
import { clampPan, fittedSize, panLimits } from "./media-viewer-pan";

const viewport = { width: 400, height: 800 };

it("allows no pan at rest, so the first gesture cannot move the image", () => {
  expect(panLimits(viewport, { width: 800, height: 400 }, 1)).toEqual({ x: 0, y: 0 });
});

it("limits a zoomed landscape photo to its own overflow", () => {
  // contain: 800x400 shows as 400x200; at 2x it is 800x400, so 200 of width spills past each side.
  expect(fittedSize(viewport, { width: 800, height: 400 })).toEqual({ width: 400, height: 200 });
  expect(panLimits(viewport, { width: 800, height: 400 }, 2)).toEqual({ x: 200, y: 0 });
});

it("keeps a small image from being panned out of view", () => {
  // 100x100 shows as 400x400; at 2x it is 800x800, which exactly fills the viewport height.
  expect(panLimits(viewport, { width: 100, height: 100 }, 2)).toEqual({ x: 200, y: 0 });
});

it("falls back to the viewport when the natural size is unknown", () => {
  expect(panLimits(viewport, { width: 0, height: 0 }, 2)).toEqual({ x: 200, y: 400 });
});

it("clamps a runaway drag and keeps values inside the limit", () => {
  expect(clampPan(10_000, 200)).toBe(200);
  expect(clampPan(-10_000, 200)).toBe(-200);
  expect(clampPan(37, 200)).toBe(37);
});

it("regression: a fully dragged zoomed photo still overlaps the viewport", () => {
  const natural = { width: 800, height: 400 };
  const scale = 2;
  const shown = fittedSize(viewport, natural);
  const limit = panLimits(viewport, natural, scale);
  for (const drag of [-50_000, 50_000]) {
    const offset = clampPan(drag, limit.x);
    const halfShown = (shown.width * scale) / 2;
    const left = offset - halfShown;
    const right = offset + halfShown;
    expect(left).toBeLessThanOrEqual(viewport.width / 2);
    expect(right).toBeGreaterThanOrEqual(-viewport.width / 2);
  }
});
