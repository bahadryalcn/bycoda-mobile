import { describe, expect, it } from "vitest";
import { AUTO_SEND_SAFETY_MS, RUNNING_TRUST_MS, automaticAttemptCanWait } from "./queue-auto-send";

describe("automatic queue attempts", () => {
  it("waits without a Host request while a recent snapshot shows a running turn", () => {
    expect(automaticAttemptCanWait({ status: "running" }, 100_000, 100_000 + 1_000)).toBe(true);
  });

  it("reads live once a running snapshot is no longer trusted", () => {
    expect(automaticAttemptCanWait({ status: "running" }, 100_000, 100_000 + RUNNING_TRUST_MS)).toBe(false);
  });

  it("never skips on an idle, interrupted or missing snapshot", () => {
    expect(automaticAttemptCanWait({ status: "idle" }, 100_000, 100_001)).toBe(false);
    expect(automaticAttemptCanWait({ status: "interrupted" }, 100_000, 100_001)).toBe(false);
    expect(automaticAttemptCanWait(undefined, 0, 100_001)).toBe(false);
    expect(automaticAttemptCanWait({ status: "running" }, 0, 100_001)).toBe(false);
  });

  it("keeps the safety timer well above the old 2.5 s poll and below the trust window", () => {
    expect(AUTO_SEND_SAFETY_MS).toBeGreaterThan(2500);
    expect(AUTO_SEND_SAFETY_MS).toBeLessThanOrEqual(RUNNING_TRUST_MS);
  });
});
