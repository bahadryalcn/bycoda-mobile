import { describe, expect, it } from "vitest";
import { queryOwnsRegion } from "./query-region";

describe("queryOwnsRegion", () => {
  it("owns the region for skeleton, no-data error and empty states", () => {
    expect(queryOwnsRegion({ isPending: true, fetchStatus: "fetching" })).toBe(true);
    expect(queryOwnsRegion({ error: new Error("x") })).toBe(true);
    expect(queryOwnsRegion({ data: [], isSuccess: true }, true)).toBe(true);
  });
  it("leaves stale errors, paused and populated lists to the banner", () => {
    expect(queryOwnsRegion({ data: [1], error: new Error("x") })).toBe(false);
    expect(queryOwnsRegion({ data: [1], fetchStatus: "paused" })).toBe(false);
    expect(queryOwnsRegion({ data: [1], isSuccess: true }, false)).toBe(false);
  });
});
