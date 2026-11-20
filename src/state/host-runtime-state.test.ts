import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hostRuntimeState,
  recordHostRuntimeState,
  resetHostRuntimeStates,
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
});
