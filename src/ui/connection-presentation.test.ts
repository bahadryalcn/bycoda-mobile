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
  it("identifies local storage failures before permission or cached successful traffic", () => {
    expect(connectionPhase({ ...state, permitted: false, storageError: "Connection preference could not be saved." })).toBe("storage");
    expect(connectionPhase({ ...state, storageError: "Language preference could not be saved." })).toBe("storage");
    expect(connectionPhase({ ...state, unlocked: false, storageError: "Storage failure" })).toBe("locked");
  });
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
  it("names a refused device key as access, not as a lost connection", () => {
    expect(connectionPhase({ ...state, errorAt: 99_500, accessDenied: true })).toBe("access");
    expect(connectionPhase({ ...state, networkConnected: false, accessDenied: true })).toBe("offline");
  });
  it("allows a newer successful request to recover an older health error", () => {
    expect(connectionPhase({ ...state, errorAt: 98_000 })).toBe("connected");
  });
});
