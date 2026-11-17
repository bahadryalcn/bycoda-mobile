import { describe, expect, it } from "vitest";
import { adaptiveLayout, splitListWidth, wideDock } from "./adaptive-layout-model";

describe("adaptiveLayout", () => {
  it("keeps phones in either orientation on the phone layout", () => {
    expect(adaptiveLayout(390, 844)).toEqual({ tablet: false, split: false });
    expect(adaptiveLayout(844, 390)).toEqual({ tablet: false, split: false });
  });

  it("uses tablet chrome without a split in portrait", () => {
    expect(adaptiveLayout(834, 1194)).toEqual({ tablet: true, split: false });
    expect(adaptiveLayout(768, 1024)).toEqual({ tablet: true, split: false });
  });

  it("splits a tablet in landscape", () => {
    expect(adaptiveLayout(1194, 834)).toEqual({ tablet: true, split: true });
    expect(adaptiveLayout(1024, 768)).toEqual({ tablet: true, split: true });
  });

  it("drops the split when a tablet window is narrowed by multitasking", () => {
    expect(adaptiveLayout(694, 1024)).toEqual({ tablet: true, split: false });
  });
});

describe("adaptiveLayout with a fold", () => {
  const book = (left = 400, width = 0) => ({
    posture: "half-opened" as const,
    orientation: "vertical" as const,
    hingeBounds: { left, top: 0, width, height: 800 },
    isSeparating: true,
  });
  it("splits exactly at a separating vertical hinge", () => {
    expect(adaptiveLayout(800, 760, book(400, 24))).toEqual({
      tablet: true,
      split: true,
      hinge: { axis: "vertical", start: 400, size: 24 },
    });
  });
  it("ignores a non-separating fold and the cover screen", () => {
    expect(adaptiveLayout(800, 760, { ...book(), isSeparating: false })).toEqual({ tablet: true, split: false });
    expect(adaptiveLayout(390, 844, null)).toEqual({ tablet: false, split: false });
  });
  it("ignores a hinge that leaves a pane too narrow", () => {
    expect(adaptiveLayout(800, 760, book(100))).toEqual({ tablet: true, split: false });
  });
  it("reports tabletop for a half-opened horizontal hinge", () => {
    const fold = {
      posture: "half-opened" as const,
      orientation: "horizontal" as const,
      hingeBounds: { left: 0, top: 400, width: 800, height: 0 },
      isSeparating: true,
    };
    expect(adaptiveLayout(800, 760, fold).tabletop).toEqual({ axis: "horizontal", start: 400, size: 0 });
    expect(adaptiveLayout(800, 760, { ...fold, posture: "flat" }).tabletop).toBeUndefined();
  });
});

describe("iPad size classes", () => {
  it("is a tablet without a split in every portrait size", () => {
    for (const [w, h] of [[744, 1133], [820, 1180], [834, 1194], [1024, 1366]] as const) {
      expect(adaptiveLayout(w, h)).toEqual({ tablet: true, split: w >= 960 });
    }
  });
  it("splits every landscape size", () => {
    for (const [w, h] of [[1133, 744], [1180, 820], [1194, 834], [1366, 1024]] as const) {
      expect(adaptiveLayout(w, h)).toEqual({ tablet: true, split: true });
    }
  });
});

describe("splitListWidth", () => {
  it("is 32% of the window clamped to 320-420", () => {
    expect(splitListWidth(960)).toBe(320);
    expect(splitListWidth(1133)).toBe(363);
    expect(splitListWidth(1366)).toBe(420);
    expect(splitListWidth(2000)).toBe(420);
    expect(splitListWidth(500)).toBe(320);
  });
});

describe("wideDock", () => {
  it("covers tablets in both orientations and landscape large phones only", () => {
    expect(wideDock(744, 1133)).toBe(true);
    expect(wideDock(1366, 1024)).toBe(true);
    expect(wideDock(844, 390)).toBe(true);
    expect(wideDock(390, 844)).toBe(false);
    expect(wideDock(667, 375)).toBe(false);
  });
});
