import { describe, expect, it } from "vitest";
import { compactMoney, isPartialScan, omittedCost, presentLimitsReport, quotaFailure, readCostReport, readLimitsReport, resetCountdown, wholePercent, type UsageLimitsReport } from "./usage-limits-model";

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
    const en = { day: "d", hour: "h", minute: "min" };
    const tr = { day: "gün", hour: "sa", minute: "dk" };
    expect(resetCountdown(NOW + 4.5 * 86_400_000, NOW, "en", en)).toBe("4 d 12 h");
    expect(resetCountdown(NOW + 185 * 60_000, NOW, "tr", tr)).toBe("3 sa 5 dk");
    expect(resetCountdown(NOW + 20_000, NOW, "en", en)).toBe("1 min");
    expect(resetCountdown(NOW + 185 * 60_000, NOW)).toBe("3h 5m");
    expect(resetCountdown(NOW + 86_400_000, NOW)).toBe("1d 0h");
    expect(resetCountdown(NOW - 1, NOW, "en", en)).toBeNull();
    expect(resetCountdown(null, NOW, "en", en)).toBeNull();
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
    expect(compactMoney(1500)).toBe("$1.5K");
    expect(compactMoney(3.456, "tr")).toBe("$3,46");
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

  it("labels what the capped lists and the file cap leave out of a cost report", () => {
    const row = (costUsd: number, tokens: number) => ({ costUsd, tokens });
    const report = (overrides: Record<string, unknown>) => ({
      totals: { ...row(10, 1000), activeDays: 3 },
      models: [row(4, 400)], projects: [row(6, 600), row(1, 100)],
      coverage: { truncated: false, filesScanned: 12, unpricedModels: [] },
      ...overrides,
    }) as unknown as Parameters<typeof omittedCost>[0];
    // Models list 400 of 1000 tokens; the 600-token / $6 tail is the folded "other" row.
    expect(omittedCost(report({}), "models")).toEqual({ costUsd: 6, tokens: 600 });
    expect(omittedCost(report({}), "projects")).toEqual({ costUsd: 3, tokens: 300 });
    // A complete list leaves nothing to show.
    expect(omittedCost(report({ models: [row(10, 1000)] }), "models")).toBeNull();
    expect(isPartialScan(report({}))).toBe(false);
    expect(isPartialScan(report({ coverage: { truncated: true, filesScanned: 20000, unpricedModels: [] } }))).toBe(true);
  });
});

describe("Host default account presentation", () => {
  const weekly = (left: number, resetsAt: number | null = NOW + 86_400_000) => ({ ...reading, leftPercent: left, resetsAt });
  const account = (id: string, label: string, status: "ok" | "unavailable" | "error" = "ok") =>
    ({ id, label, color: "#fff", status, error: status === "ok" ? null : "Claude usage will update when this account is used again", resetCredits: null });
  const report = (hostLeft: number | null, hostStatus: "ok" | "unavailable" | "error" = "ok", hostReset?: number | null) => {
    const entries = [
      ...(hostLeft === null ? [] : [{ id: "default", label: "Host default", color: "#fff", reading: weekly(hostLeft, hostReset) }]),
      { id: "personal", label: "Personal", color: "#fff", reading: weekly(87) },
      { id: "work", label: "work", color: "#fff", reading: weekly(64, NOW + 3_600_000) },
    ].sort((a, b) => b.reading.leftPercent - a.reading.leftPercent);
    return {
      environmentId: "env", sampledAt: NOW, source: "host-provider-api",
      providers: [{
        provider: "claude",
        cards: [{ key: "weekly", kind: "weekly", model: null, best: entries[0]!.reading, accounts: entries }],
        accounts: [account("default", "Host default", hostStatus), account("personal", "Personal"), account("work", "work")],
      }],
    } as UsageLimitsReport;
  };

  it("drops the Host profile when it repeats a named profile's quota, even with a failed reread", () => {
    const [claude] = presentLimitsReport(report(87.2, "error"), "Default account").providers;
    expect(claude!.accounts.map((entry) => entry.id)).toEqual(["personal", "work"]);
    expect(claude!.cards[0]!.accounts.map((entry) => entry.id)).toEqual(["personal", "work"]);
    expect(claude!.cards[0]!.best.leftPercent).toBe(87);
  });

  it("renames a distinct Host profile instead of leaking its internal label", () => {
    const [claude] = presentLimitsReport(report(40), "Default account").providers;
    expect(claude!.accounts.map((entry) => entry.label)).toEqual(["Default account", "Personal", "work"]);
    expect(claude!.cards[0]!.accounts.find((entry) => entry.id === "default")!.label).toBe("Default account");
  });

  it("needs a matching reset instant before treating two accounts as one", () => {
    const [claude] = presentLimitsReport(report(87, "ok", NOW + 2 * 86_400_000), "Default account").providers;
    expect(claude!.accounts.some((entry) => entry.id === "default")).toBe(true);
  });

  it("leaves out a signed-out Host profile beside named profiles", () => {
    const [claude] = presentLimitsReport(report(null, "unavailable"), "Default account").providers;
    expect(claude!.accounts.map((entry) => entry.id)).toEqual(["personal", "work"]);
  });

  it("keeps a lone Host profile and other providers' synthetic default accounts", () => {
    const lone = { ...report(null), providers: [{ provider: "opencode", cards: [], accounts: [{ ...account("default", "OpenCode Go") }] }] } as UsageLimitsReport;
    expect(presentLimitsReport(lone, "Default account").providers[0]!.accounts[0]!.label).toBe("OpenCode Go");
  });

  it("names known Host failures", () => {
    expect(quotaFailure({ status: "error", error: "Claude usage will update when this account is used again" })).toBe("renewal");
    expect(quotaFailure({ status: "error", error: "Claude sign-in expired" })).toBe("signedOut");
    expect(quotaFailure({ status: "error", error: "Claude usage request failed (429)" })).toBe("rateLimited");
    expect(quotaFailure({ status: "unavailable", error: "Codex CLI not found" })).toBe("unavailable");
    expect(quotaFailure({ status: "error", error: "Claude usage request failed" })).toBe("unreadable");
  });
});
