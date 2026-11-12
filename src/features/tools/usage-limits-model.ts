import type { UsageLimitsReport } from "../../../../host/usage/limits-report";
import type { CostReport } from "../../../../host/usage/cost-report";
export type { UsageLimitsReport, CostReport };

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const num = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const text = (value: unknown, max = 200): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const reading = (value: unknown) => record(value) && num(value.usedPercent, 0, 100) && num(value.leftPercent, 0, 100) && num(value.regainPercent, 0, 100) && num(value.windowMinutes, 1) && (value.resetsAt === null || num(value.resetsAt)) && (value.timeLeftPercent === null || num(value.timeLeftPercent, 0, 100)) && (value.pace === null || value.pace === "ahead" || value.pace === "on" || value.pace === "behind");

const KNOWN_PROVIDERS = new Set(["claude", "codex", "opencode"]);

/** Rejects a Host reply that is not the documented quota report instead of drawing guesses. */
export function readLimitsReport(value: unknown, environmentId: string): UsageLimitsReport {
  const invalid = (): never => { throw new Error("Invalid host usage limits report"); };
  if (!record(value) || value.environmentId !== environmentId || value.source !== "host-provider-api" || !num(value.sampledAt) || !Array.isArray(value.providers) || value.providers.length > 8) return invalid();
  // A provider this app does not know yet (a newer Host) is skipped, not a reason to drop the report.
  const providers = (value.providers as unknown[]).filter((provider) => !record(provider) || KNOWN_PROVIDERS.has(String(provider.provider)));
  for (const provider of providers) {
    if (!record(provider) || !Array.isArray(provider.cards) || provider.cards.length > 64 || !Array.isArray(provider.accounts) || provider.accounts.length > 128) return invalid();
    for (const account of provider.accounts) {
      if (!record(account) || !text(account.id) || !text(account.label) || !text(account.color, 64) || !["ok", "unavailable", "error"].includes(String(account.status)) || (account.error !== null && !text(account.error, 400)) || (account.resetCredits !== null && !num(account.resetCredits, 0, 1000))) return invalid();
    }
    for (const card of provider.cards) {
      if (!record(card) || !text(card.key) || !["session", "weekly", "monthly"].includes(String(card.kind)) || (card.model !== null && !text(card.model, 100)) || !reading(card.best) || !Array.isArray(card.accounts) || card.accounts.length > 128 || !card.accounts.every((entry) => record(entry) && text(entry.id) && text(entry.label) && text(entry.color, 64) && reading(entry.reading))) return invalid();
    }
  }
  return { ...value, providers } as UsageLimitsReport;
}

export function readCostReport(value: unknown, environmentId: string): CostReport {
  const invalid = (): never => { throw new Error("Invalid host usage cost report"); };
  const line = (entry: unknown) => record(entry) && num(entry.costUsd) && num(entry.tokens);
  if (!record(value) || value.environmentId !== environmentId || !num(value.sampledAt) || !record(value.window) || !num(value.window.days, 1, 90) || !record(value.totals) || !line(value.totals) || !num(value.totals.activeDays, 0, 90)) return invalid();
  const lists = [value.providers, value.models, value.projects, value.daily];
  if (!lists.every((list) => Array.isArray(list) && list.length <= 100 && list.every(line))) return invalid();
  if (!(value.daily as { date: unknown }[]).every((day) => typeof day.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day.date)) || !record(value.coverage) || !Array.isArray(value.coverage.unpricedModels)) return invalid();
  return value as unknown as CostReport;
}

/** "4d 12h", "3h 5m", "12m"; null once the reset time has passed or is unknown. */
export function resetCountdown(resetsAt: number | null, now: number): string | null {
  if (resetsAt === null) return null;
  const minutes = Math.max(0, Math.floor((resetsAt - now) / 60_000));
  if (resetsAt <= now) return null;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${Math.max(1, minutes)}m`;
}

/** Whole percent for display; a sliver is never rounded away to 0 or up to 100. */
export function wholePercent(value: number): number {
  const rounded = Math.round(value);
  if (rounded === 0 && value > 0) return 1;
  return rounded === 100 && value < 100 ? 99 : rounded;
}

export function compactMoney(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(value >= 100 ? 0 : 2)}`;
}
