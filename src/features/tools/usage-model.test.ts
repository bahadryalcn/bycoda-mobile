import { expect, it } from "vitest";
import { readUsageReport, usageDuration, usageNumber } from "./usage-model";
const expected = { environmentId: "host", projectId: "project", sinceMs: 100, untilMs: 200 };
const metrics = { turns: 1, timedTurns: 0, durationMs: null, inputTokens: null, outputTokens: 0, cacheReadTokens: null, cacheWriteTokens: null, cost: null };
const report = { environmentId: "host", projectId: "project", scope: "host-observed-sessions", sampledAt: 300, window: { start: 100, end: 200, timeZone: "UTC", attribution: "turn-start" }, coverage: { source: "host-store", truncated: false, scannedSessions: 1, skippedSessions: 0, undatedTurns: 0, unavailableFields: ["cost"] }, totals: metrics, rows: [{ sessionId: "s", provider: "codex", ...metrics }], nextCursor: null };
it("preserves measured zero versus unknown without accepting another host/project/window", () => {
  expect(readUsageReport(report, expected).totals).toEqual(metrics);
  expect(usageNumber(null)).toBe("—"); expect(usageNumber(0)).toBe("0"); expect(usageDuration(null)).toBe("—");
  for (const patch of [{ environmentId: "other" }, { projectId: "other" }, { window: { ...report.window, start: 101 } }, { totals: { ...metrics, cost: 0 } }, { rows: new Array(101).fill(report.rows[0]) }, { rows: [report.rows[0], report.rows[0]] }, { sampledAt: 9e15 }, { totals: { ...metrics, inputTokens: -1 } }]) {
    expect(() => readUsageReport({ ...report, ...patch }, expected)).toThrow();
  }
});
it("keeps page omissions and undated scope explicit", () => {
  const partial = { ...report, coverage: { ...report.coverage, truncated: true, undatedTurns: 2, skippedSessions: 1 }, rows: [], totals: { ...metrics, turns: 0, outputTokens: null } };
  expect(readUsageReport(partial, expected).coverage).toMatchObject({ truncated: true, undatedTurns: 2 });
  expect(readUsageReport(partial, expected).totals.inputTokens).toBe(null);
});
it("formats counts and durations in the app language with readable units", () => {
  expect(usageNumber(12345, "tr")).toBe("12.345");
  expect(usageDuration(42_000)).toBe("42 s");
  expect(usageDuration(720_000)).toBe("12 min");
  expect(usageDuration(11_100_000, "tr", { hour: "sa", minute: "dk", second: "sn" })).toBe("3 sa 5 dk");
});
