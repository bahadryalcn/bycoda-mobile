import { describe, expect, it } from "vitest";
import { connectionPhase } from "./connection-presentation";

const state = {
  paired: true,
  networkConnected: true,
  unlocked: true,
  permitted: true,
  successAt: 99_000,
  errorAt: 0,
  now: 100_000,
};
describe("connection presentation", () => {
  it("uses recent successful host traffic even before the health query finishes", () => {
    expect(connectionPhase(state)).toBe("connected");
    expect(connectionPhase({ ...state, successAt: 0 })).toBe("checking");
    expect(connectionPhase({ ...state, successAt: 1 })).toBe("checking");
  });
  it("does not call saved metadata, stale traffic or a failed connection live", () => {
    expect(connectionPhase({ ...state, errorAt: 99_500 })).toBe("disconnected");
    expect(connectionPhase({ ...state, networkConnected: false })).toBe("offline");
    expect(connectionPhase({ ...state, permitted: false })).toBe("permission");
    expect(connectionPhase({ ...state, unlocked: false })).toBe("locked");
    expect(connectionPhase({ ...state, paired: false })).toBe("unpaired");
  });
  it("allows a newer successful request to recover an older health error", () => {
    expect(connectionPhase({ ...state, errorAt: 98_000 })).toBe("connected");
  });
});
