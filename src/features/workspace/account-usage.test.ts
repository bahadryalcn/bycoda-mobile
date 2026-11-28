import { expect, it } from "vitest";
import type { UsageLimitsReport } from "../tools/usage-limits-model";
import { accountUsage } from "./account-usage";

const now = 1_800_000_000_000;
const reading = (leftPercent: number, resetsAt: number | null) =>
  ({ usedPercent: 100 - leftPercent, leftPercent, regainPercent: 0, windowMinutes: 300, resetsAt, timeLeftPercent: null, pace: null });
const card = (key: string, model: string | null, accounts: [string, number, number | null][]) => ({
  key,
  kind: "session" as const,
  model,
  best: reading(0, null),
  accounts: accounts.map(([id, left, resetsAt]) => ({ id, label: id, color: "#000", reading: reading(left, resetsAt) })),
});
const report = {
  environmentId: "e",
  sampledAt: now,
  source: "host-provider-api",
  providers: [{
    provider: "claude",
    accounts: [],
    cards: [
      card("session", null, [["default", 62, now + 1000], ["work", 0, now + 60_000], ["stale", 0, now - 1000]]),
      card("weekly", null, [["default", 80, now + 5000], ["work", 0, now + 120_000], ["stale", 40, now + 1000]]),
      card("weekly-opus", "Opus", [["default", 5, now + 5000], ["models", 30, null]]),
    ],
  }],
} as unknown as UsageLimitsReport;

it("maps the default login and named profiles by catalogue account id, tightest provider-wide window first", () => {
  expect(accountUsage(report, "claude", undefined, now)).toEqual({ kind: "left", percent: 62 });
  // Exhausted until every used-up window resets.
  expect(accountUsage(report, "claude", "work", now)).toEqual({ kind: "exhausted", resetsAt: now + 120_000 });
  // A used-up window whose reset passed is stale.
  expect(accountUsage(report, "claude", "stale", now)).toEqual({ kind: "left", percent: 40 });
  // Per-model windows only count when the account has no provider-wide one.
  expect(accountUsage(report, "claude", "models", now)).toEqual({ kind: "left", percent: 30 });
});

it("is unknown without a report, provider or reading", () => {
  expect(accountUsage(undefined, "claude", undefined, now)).toBeUndefined();
  expect(accountUsage(report, "codex", undefined, now)).toBeUndefined();
  expect(accountUsage(report, "claude", "missing", now)).toBeUndefined();
});
