import { describe, expect, it } from "vitest";
import { adaptiveLayout } from "./adaptive-layout-model";

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
