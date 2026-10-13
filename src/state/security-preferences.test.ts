import { describe, expect, it } from "vitest";
import {
  isWithinLockGrace,
  parseSecurityPreferences,
} from "./security-preferences";

describe("background grace clock checks", () => {
  const started = { wall: 100_000, monotonic: 20_000 };
  it.each([
    [{ wall: 129_999, monotonic: 49_999 }, true],
    [{ wall: 130_000, monotonic: 50_000 }, false],
    [{ wall: 90_000, monotonic: 20_100 }, false],
    [{ wall: 100_100, monotonic: 19_999 }, false],
    [{ wall: 105_000, monotonic: 20_100 }, false],
    [{ wall: 100_100, monotonic: Number.NaN }, false],
    [{ wall: Number.POSITIVE_INFINITY, monotonic: 20_100 }, false],
  ])("evaluates safe grace for %o", (current, expected) => {
    expect(isWithinLockGrace(started, current, 30_000)).toBe(expected);
  });
  it("never permits an immediate timeout even with zero elapsed time", () => {
    expect(isWithinLockGrace(started, started, 0)).toBe(false);
  });
});

describe("security preferences validation", () => {
  it.each([0, 30_000, 60_000, 300_000, 900_000])(
    "accepts the supported %i ms timeout",
    (autoLockTimeoutMs) => {
      expect(
        parseSecurityPreferences(
          JSON.stringify({ version: 2, enabled: true, autoLockTimeoutMs }),
        ),
      ).toEqual({ enabled: true, autoLockTimeoutMs });
    },
  );
  it.each([
    null,
    [],
    { version: 1, enabled: true, autoLockTimeoutMs: 0 },
    { version: 2, enabled: true, autoLockTimeoutMs: 1 },
    { version: 2, enabled: true, autoLockTimeoutMs: "30000" },
  ])("rejects malformed or unsupported configuration %o", (value) => {
    expect(() => parseSecurityPreferences(JSON.stringify(value))).toThrow();
  });
});
