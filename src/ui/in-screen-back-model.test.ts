import { describe, expect, it } from "vitest";
import { shouldCompleteEdgeBack } from "./in-screen-back-model";

describe("shouldCompleteEdgeBack", () => {
  it("completes on a long horizontal drag", () => {
    expect(shouldCompleteEdgeBack({ translationX: 80, translationY: 10, velocityX: 100 })).toBe(true);
  });
  it("completes on a short fast flick", () => {
    expect(shouldCompleteEdgeBack({ translationX: 30, translationY: 4, velocityX: 900 })).toBe(true);
  });
  it("ignores a short slow drag", () => {
    expect(shouldCompleteEdgeBack({ translationX: 30, translationY: 4, velocityX: 100 })).toBe(false);
  });
  it("ignores mostly vertical movement", () => {
    expect(shouldCompleteEdgeBack({ translationX: 70, translationY: 120, velocityX: 900 })).toBe(false);
  });
  it("ignores a drag toward the edge", () => {
    expect(shouldCompleteEdgeBack({ translationX: -80, translationY: 0, velocityX: -900 })).toBe(false);
  });
});
