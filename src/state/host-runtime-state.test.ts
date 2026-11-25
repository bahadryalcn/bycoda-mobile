import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  holdHostRecoveryClocks,
  hostRecoveringSince,
  hostRuntimeState,
  recordHostRuntimeState,
  resetHostRuntimeStates,
  resumeHostRecoveryClocks,
  subscribeHostRuntimeStates,
} from "./host-runtime-state";

describe("host runtime state store", () => {
  beforeEach(() => resetHostRuntimeStates());

  it("keeps each computer's live socket state under its own identity", () => {
    recordHostRuntimeState("a", "ready");
    recordHostRuntimeState("b", "backoff");
    expect(hostRuntimeState("a")).toBe("ready");
    expect(hostRuntimeState("b")).toBe("backoff");
    expect(hostRuntimeState("c")).toBeUndefined();
    expect(hostRuntimeState(null)).toBeUndefined();
    expect(hostRuntimeState(undefined)).toBeUndefined();
  });

  it("keeps one recovery start across connect and backoff until the link is ready", () => {
    vi.useFakeTimers({ now: 1_000 });
    try {
      recordHostRuntimeState("a", "ready");
      expect(hostRecoveringSince("a")).toBeNull();
      recordHostRuntimeState("a", "backoff");
      vi.setSystemTime(4_000);
      recordHostRuntimeState("a", "connecting");
      vi.setSystemTime(7_000);
      recordHostRuntimeState("a", "backoff");
      expect(hostRecoveringSince("a")).toBe(1_000);
      recordHostRuntimeState("a", "ready");
      expect(hostRecoveringSince("a")).toBeNull();
      recordHostRuntimeState("a", "backoff");
      expect(hostRecoveringSince("a")).toBe(7_000);
      recordHostRuntimeState("a", "blocked");
      expect(hostRecoveringSince("a")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("notifies on a change only, and stops after unsubscribe", () => {
    const listener = vi.fn();
    const stop = subscribeHostRuntimeStates(listener);
    recordHostRuntimeState("a", "connecting");
    recordHostRuntimeState("a", "connecting");
    recordHostRuntimeState("a", "ready");
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    recordHostRuntimeState("a", "backoff");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does not count background time against a reconnect grace and restarts it on return", () => {
    vi.useFakeTimers({ now: 1_000 });
    try {
      const listener = vi.fn();
      const stop = subscribeHostRuntimeStates(listener);
      holdHostRecoveryClocks();
      // The OS closed the socket in the background; the runtime retries there.
      recordHostRuntimeState("a", "backoff");
      vi.setSystemTime(120_000);
      expect(hostRecoveringSince("a")).toBe(120_000);
      vi.setSystemTime(180_000);
      resumeHostRecoveryClocks();
      vi.setSystemTime(181_000);
      expect(hostRecoveringSince("a")).toBe(180_000);
      expect(hostRecoveringSince("b")).toBeNull();
      // A second resume without leaving is not a new return.
      const calls = listener.mock.calls.length;
      resumeHostRecoveryClocks();
      expect(listener).toHaveBeenCalledTimes(calls);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
