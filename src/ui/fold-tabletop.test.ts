import { describe, expect, it } from "vitest";
import { tabletopFrameSplit } from "./fold-tabletop-model";

describe("tabletopFrameSplit", () => {
  const hinge = { start: 500, size: 20 };
  it("ends the content at the hinge, offset by the frame's own top", () => {
    expect(tabletopFrameSplit(100, 900, hinge)).toEqual({ contentHeight: 400, hingeHeight: 20 });
  });
  it("is null when the hinge is above the frame or leaves no room below", () => {
    expect(tabletopFrameSplit(500, 900, hinge)).toBeNull();
    expect(tabletopFrameSplit(100, 420, hinge)).toBeNull();
  });
});
