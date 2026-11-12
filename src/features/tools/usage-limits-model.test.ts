import { describe, expect, it } from "vitest";
import { compactMoney, readCostReport, readLimitsReport, resetCountdown, wholePercent } from "./usage-limits-model";

const NOW = Date.parse("2026-11-09T12:00:00Z");
const reading = { usedPercent: 63, leftPercent: 37, regainPercent: 63, windowMinutes: 10080, resetsAt: NOW + 4.5 * 86_400_000, timeLeftPercent: 64.3, pace: "ahead" };
const limits = (over: Record<string, unknown> = {}) => structuredClone({
  environmentId: "env",
  sampledAt: NOW,
  source: "host-provider-api",
  providers: [{
    provider: "claude",
    cards: [{ key: "weekly", kind: "weekly", model: null, best: reading, accounts: [{ id: "default", label: "Host default", color: "#fff", reading }] }],
    accounts: [{ id: "default", label: "Host default", color: "#fff", status: "ok", error: null, resetCredits: null }],
  }],
  ...over,
});

describe("usage limits model", () => {
  it("formats reset countdowns", () => {
    expect(resetCountdown(NOW + 4.5 * 86_400_000, NOW)).toBe("4d 12h");
    expect(resetCountdown(NOW + 185 * 60_000, NOW)).toBe("3h 5m");
    expect(resetCountdown(NOW + 20_000, NOW)).toBe("1m");
    expect(resetCountdown(NOW - 1, NOW)).toBeNull();
    expect(resetCountdown(null, NOW)).toBeNull();
  });

  it("never rounds a sliver to empty or almost full to full", () => {
    expect(wholePercent(0.2)).toBe(1);
    expect(wholePercent(99.7)).toBe(99);
    expect(wholePercent(0)).toBe(0);
    expect(wholePercent(100)).toBe(100);
    expect(wholePercent(36.6)).toBe(37);
  });

  it("formats money compactly", () => {
    expect(compactMoney(3.456)).toBe("$3.46");
    expect(compactMoney(250.4)).toBe("$250");
    expect(compactMoney(1500)).toBe("$1.5k");
  });

  it("accepts a well-formed limits report and rejects wrong host, shape or ranges", () => {
    expect(readLimitsReport(limits(), "env").providers).toHaveLength(1);
    expect(() => readLimitsReport(limits(), "other")).toThrow();
    expect(() => readLimitsReport(limits({ source: "x" }), "env")).toThrow();
    const bad = limits();
    (bad.providers[0].cards[0].best as { leftPercent: number }).leftPercent = 140;
    expect(() => readLimitsReport(bad, "env")).toThrow();
    expect(() => readLimitsReport(null, "env")).toThrow();
  });
  it("keeps OpenCode and skips a provider a newer Host adds instead of dropping the report", () => {
    const base = limits();
    const claude = base.providers[0];
    const report = readLimitsReport({ ...base, providers: [claude, { ...claude, provider: "opencode" }, { ...claude, provider: "future-cli" }] }, "env");
    expect(report.providers.map((entry) => entry.provider)).toEqual(["claude", "opencode"]);
  });

  it("validates cost reports", () => {
    const line = { costUsd: 1, tokens: 2 };
    const report = {
      environmentId: "env", sampledAt: NOW, window: { days: 7 }, totals: { ...line, activeDays: 1 },
      providers: [line], models: [line], projects: [line], daily: [{ ...line, date: "2026-11-09" }],
      coverage: { unpricedModels: [] },
    };
    expect(readCostReport(report, "env").totals.costUsd).toBe(1);
    expect(() => readCostReport({ ...report, daily: [{ ...line, date: "yesterday" }] }, "env")).toThrow();
    expect(() => readCostReport({ ...report, window: { days: 400 } }, "env")).toThrow();
  });
});
