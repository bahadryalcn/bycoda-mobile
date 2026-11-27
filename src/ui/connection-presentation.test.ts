import { describe, expect, it } from "vitest";
import { CONNECTION_BLIP_GRACE_MS, connectionPhase, settleConnectionPhase } from "./connection-presentation";

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
  it("separates a failed connection startup from access and network gates", () => {
    expect(connectionPhase({ ...state, startupFailed: true })).toBe("startup-failed");
    expect(connectionPhase({ ...state, startupFailed: true, permitted: false })).toBe("permission");
    expect(connectionPhase({ ...state, startupFailed: true, networkConnected: false })).toBe("offline");
    expect(connectionPhase({ ...state, startupFailed: true, unlocked: false })).toBe("locked");
  });
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
  it("stops claiming connected once the success window closes", () => {
    expect(connectionPhase({ ...state, successAt: 100_000 - 44_999 })).toBe("connected");
    expect(connectionPhase({ ...state, successAt: 100_000 - 45_000 })).toBe("checking");
  });
  it("lets the live socket state override a recent describe success or error (#454)", () => {
    expect(connectionPhase({ ...state, runtime: "backoff" })).toBe("disconnected");
    expect(connectionPhase({ ...state, runtime: "connecting" })).toBe("checking");
    expect(connectionPhase({ ...state, runtime: "blocked" })).toBe("disconnected");
    expect(connectionPhase({ ...state, runtime: "blocked", errorAt: 99_500, accessDenied: true })).toBe("access");
    expect(connectionPhase({ ...state, successAt: 0, runtime: "ready" })).toBe("connected");
    expect(connectionPhase({ ...state, successAt: 1, errorAt: 99_500, probeStalled: true, runtime: "ready" })).toBe("connected");
  });
  it("keeps a short reconnect quiet, then states the disconnect", () => {
    expect(connectionPhase({ ...state, runtime: "backoff", recoveringSince: 99_000 })).toBe("checking");
    expect(connectionPhase({ ...state, runtime: "backoff", recoveringSince: 94_001 })).toBe("checking");
    expect(connectionPhase({ ...state, runtime: "backoff", recoveringSince: 94_000 })).toBe("disconnected");
    expect(connectionPhase({ ...state, runtime: "blocked", recoveringSince: 99_000 })).toBe("disconnected");
  });
  it("keeps device-level gates ahead of the live socket state", () => {
    expect(connectionPhase({ ...state, runtime: "ready", networkConnected: false })).toBe("offline");
    expect(connectionPhase({ ...state, runtime: "ready", unlocked: false })).toBe("locked");
    expect(connectionPhase({ ...state, runtime: "ready", permitted: false })).toBe("permission");
    expect(connectionPhase({ ...state, runtime: "ready", storageError: "Storage failure" })).toBe("storage");
    expect(connectionPhase({ ...state, runtime: "ready", paired: false })).toBe("unpaired");
  });
  it("falls back to the describe poll without a usable live socket state", () => {
    for (const runtime of [undefined, null, "idle", "suspended", "closed"]) {
      expect(connectionPhase({ ...state, runtime })).toBe("connected");
      expect(connectionPhase({ ...state, runtime, errorAt: 99_500 })).toBe("disconnected");
      expect(connectionPhase({ ...state, runtime, successAt: 100_000 - 45_000 })).toBe("checking");
    }
  });
  it("shows checking while a health probe is stalled, even with recent success", () => {
    expect(connectionPhase({ ...state, probeStalled: true })).toBe("checking");
    expect(connectionPhase({ ...state, probeStalled: true, errorAt: 99_500 })).toBe("disconnected");
    expect(connectionPhase({ ...state, probeStalled: false })).toBe("connected");
  });
  it("holds a proven connection through a short blip and shows a lasting one", () => {
    const connected = settleConnectionPhase("connected", { connected: false, blipSince: null }, 1_000);
    expect(connected.phase).toBe("connected");
    const blip = settleConnectionPhase("checking", connected.memory, 2_000);
    expect(blip).toEqual({ phase: "connected", memory: { connected: true, blipSince: 2_000 }, holdUntil: 2_000 + CONNECTION_BLIP_GRACE_MS });
    const still = settleConnectionPhase("disconnected", blip.memory, 2_000 + CONNECTION_BLIP_GRACE_MS - 1);
    expect(still.phase).toBe("connected");
    // Healing inside the grace never shows the blip and clears it.
    expect(settleConnectionPhase("connected", still.memory, 3_000).memory).toEqual({ connected: true, blipSince: null });
    const lasting = settleConnectionPhase("disconnected", still.memory, 2_000 + CONNECTION_BLIP_GRACE_MS);
    expect(lasting.phase).toBe("disconnected");
    expect(settleConnectionPhase("disconnected", lasting.memory, 99_000).phase).toBe("disconnected");
  });
  it("never holds a lasting phase or a computer that was not connected yet", () => {
    const memory = { connected: true, blipSince: null };
    for (const phase of ["locked", "access", "permission", "storage", "startup-failed", "unpaired"] as const)
      expect(settleConnectionPhase(phase, memory, 1_000).phase).toBe(phase);
    expect(settleConnectionPhase("checking", { connected: false, blipSince: null }, 1_000).phase).toBe("checking");
    expect(settleConnectionPhase("offline", memory, 1_000).phase).toBe("connected");
  });
});
