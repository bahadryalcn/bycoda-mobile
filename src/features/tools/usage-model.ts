import { numberFormat } from "../../../../src/shared/i18n/numberFormat";
import type { SessionUsageReport } from "../../../../host/usage/usage-report";
export type { SessionUsageReport };
const tokenKeys = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"] as const;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const nullable = (value: unknown) => value === null || count(value);
const text = (value: unknown, max = 256): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
export function readUsageReport(value: unknown, expected: { environmentId: string; projectId: string; sinceMs: number; untilMs: number }): SessionUsageReport {
  const invalid = () => { throw new Error("Invalid host session usage report"); };
  if (!record(value) || value.environmentId !== expected.environmentId || value.projectId !== expected.projectId || value.scope !== "host-observed-sessions" || !count(value.sampledAt) || value.sampledAt > 8640000000000000 || !record(value.window) || value.window.start !== expected.sinceMs || value.window.end !== expected.untilMs || value.window.timeZone !== "UTC" || value.window.attribution !== "turn-start") return invalid();
  const metrics = (row: unknown) => record(row) && count(row.turns) && row.turns <= 400000 && count(row.timedTurns) && row.timedTurns <= row.turns && nullable(row.durationMs) && row.cost === null && tokenKeys.every((key) => nullable(row[key]));
  if (!record(value.coverage) || value.coverage.source !== "host-store" || typeof value.coverage.truncated !== "boolean" || !count(value.coverage.scannedSessions) || value.coverage.scannedSessions > 100 || !count(value.coverage.skippedSessions) || value.coverage.skippedSessions > value.coverage.scannedSessions || !count(value.coverage.undatedTurns) || !Array.isArray(value.coverage.unavailableFields) || value.coverage.unavailableFields.length > 32 || !value.coverage.unavailableFields.every((field) => text(field, 100)) || !metrics(value.totals) || !Array.isArray(value.rows) || value.rows.length > 100 || !value.rows.every((row) => metrics(row) && record(row) && text(row.sessionId) && text(row.provider, 100)) || value.nextCursor !== null && !text(value.nextCursor)) return invalid();
  const ids = value.rows.map((row) => row.sessionId);
  if (new Set(ids).size !== ids.length) return invalid();
  return value as SessionUsageReport;
}
/** A count in the app language (not the device language); unknown stays "—" for callers that cannot omit it. */
export function usageNumber(value: number | null, locale = "en"): string { return value === null ? "—" : numberFormat(locale).format(value); }
export type DurationUnits = { hour: string; minute: string; second: string };
/** "42 s", "12 min", "3 h 5 min" with the app's unit labels (native Intl units are unreliable). */
export function usageDuration(value: number | null, locale = "en", units: DurationUnits = { hour: "h", minute: "min", second: "s" }): string {
  if (value === null) return "—";
  const format = numberFormat(locale).format;
  const seconds = Math.max(0, Math.round(value / 1000));
  if (seconds < 60) return `${format(seconds)} ${units.second}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${format(minutes)} ${units.minute}`;
  const rest = minutes % 60;
  return `${format(Math.floor(minutes / 60))} ${units.hour}${rest ? ` ${format(rest)} ${units.minute}` : ""}`;
}
