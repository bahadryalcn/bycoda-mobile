import type { UsageLimitsReport } from "../../../../host/usage/limits-report";
import type { CostReport } from "../../../../host/usage/cost-report";
import { numberFormat } from "../../../../src/shared/i18n/numberFormat";
export type { UsageLimitsReport, CostReport };

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const num = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const text = (value: unknown, max = 200): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const reading = (value: unknown) => record(value) && num(value.usedPercent, 0, 100) && num(value.leftPercent, 0, 100) && num(value.regainPercent, 0, 100) && num(value.windowMinutes, 1) && (value.resetsAt === null || num(value.resetsAt)) && (value.timeLeftPercent === null || num(value.timeLeftPercent, 0, 100)) && (value.pace === null || value.pace === "ahead" || value.pace === "on" || value.pace === "behind");

const KNOWN_PROVIDERS = new Set(["claude", "codex", "opencode", "grok"]);

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
      if (account.observedAt !== undefined && account.observedAt !== null && !num(account.observedAt, 0, value.sampledAt)) return invalid();
    }
    for (const card of provider.cards) {
      if (!record(card) || !text(card.key) || !["session", "weekly", "monthly"].includes(String(card.kind)) || (card.model !== null && !text(card.model, 100)) || !reading(card.best) || !Array.isArray(card.accounts) || card.accounts.length > 128 || !card.accounts.every((entry) => record(entry) && text(entry.id) && text(entry.label) && text(entry.color, 64) && reading(entry.reading))) return invalid();
    }
  }
  return { ...value, providers } as UsageLimitsReport;
}

/** The Host's own CLI profile; it carries the fixed internal label "Host default". */
const HOST_DEFAULT_ACCOUNT = "default";
const HOST_DEFAULT_LABEL = "Host default";
const SAME_RESET_MS = 60_000;

type LimitsProvider = UsageLimitsReport["providers"][number];
type LimitReading = LimitsProvider["cards"][number]["best"];

/** One account's readings by window key. */
function accountReadings(provider: LimitsProvider, id: string): Map<string, LimitReading> {
  const readings = new Map<string, LimitReading>();
  for (const card of provider.cards) {
    const entry = card.accounts.find((account) => account.id === id);
    if (entry) readings.set(card.key, entry.reading);
  }
  return readings;
}

/** Same windows, same whole-percent headroom and the same reset instant: one sign-in seen twice. */
function sameQuota(a: Map<string, LimitReading>, b: Map<string, LimitReading>): boolean {
  if (a.size === 0 || a.size !== b.size) return false;
  let anchored = false;
  for (const [key, left] of a) {
    const right = b.get(key);
    if (!right || wholePercent(left.leftPercent) !== wholePercent(right.leftPercent)) return false;
    if ((left.resetsAt === null) !== (right.resetsAt === null)) return false;
    if (left.resetsAt !== null && right.resetsAt !== null) {
      if (Math.abs(left.resetsAt - right.resetsAt) > SAME_RESET_MS) return false;
      anchored = true;
    }
  }
  // Without a reset instant two full accounts would look alike; that is not evidence.
  return anchored;
}

/**
 * Presentation of the Host report: the Host's CLI profile gets a person-facing name instead of
 * its internal label, and is left out when it only repeats a named profile (the same sign-in, so
 * the same windows and reset instant) or when it is simply not signed in beside named profiles.
 */
export function presentLimitsReport(report: UsageLimitsReport, defaultLabel: string): UsageLimitsReport {
  const providers = report.providers.map((provider): LimitsProvider => {
    const host = provider.accounts.find((account) => account.id === HOST_DEFAULT_ACCOUNT && account.label === HOST_DEFAULT_LABEL);
    if (!host) return provider;
    const named = provider.accounts.filter((account) => account.id !== HOST_DEFAULT_ACCOUNT);
    const hostReadings = accountReadings(provider, HOST_DEFAULT_ACCOUNT);
    const duplicate = named.some((account) => sameQuota(hostReadings, accountReadings(provider, account.id)));
    const signedOut = host.status === "unavailable" && hostReadings.size === 0 && named.length > 0;
    if (duplicate || signedOut) {
      return {
        ...provider,
        accounts: named,
        cards: provider.cards.flatMap((card) => {
          const accounts = card.accounts.filter((account) => account.id !== HOST_DEFAULT_ACCOUNT);
          // Cards keep the Host's headroom order, so the first remaining account is the best one.
          return accounts.length ? [{ ...card, best: accounts[0]!.reading, accounts }] : [];
        }),
      };
    }
    const rename = <T extends { id: string; label: string }>(account: T): T =>
      account.id === HOST_DEFAULT_ACCOUNT ? { ...account, label: defaultLabel } : account;
    return {
      ...provider,
      accounts: provider.accounts.map(rename),
      cards: provider.cards.map((card) => ({ ...card, accounts: card.accounts.map(rename) })),
    };
  });
  return { ...report, providers };
}

/** Known Host failure texts, so a failed account says why instead of only "could not be read". */
export type QuotaFailure = "renewal" | "signedOut" | "rateLimited" | "unavailable" | "unreadable";
export function quotaFailure(account: { status: "ok" | "unavailable" | "error"; error: string | null }): QuotaFailure {
  const error = account.error ?? "";
  if (/will update when this account is used again/i.test(error)) return "renewal";
  if (/sign-in expired|not signed in/i.test(error)) return "signedOut";
  if (/\(429\)/.test(error)) return "rateLimited";
  return account.status === "unavailable" ? "unavailable" : "unreadable";
}

export function latestQuotaObservation(report: UsageLimitsReport): number | null {
  const accounts = report.providers.flatMap((provider) => provider.accounts);
  const observed = accounts.flatMap(({ observedAt }) => observedAt == null ? [] : [observedAt]);
  if (observed.length) return Math.max(...observed);
  return accounts.every(({ observedAt }) => observedAt === undefined) &&
    report.providers.some(({ cards }) => cards.length > 0) ? report.sampledAt : null;
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

/**
 * The cost the Host's capped model/project list leaves out. Totals count every request, so the
 * remainder after the listed rows is the folded-away tail; null when the list is complete.
 */
export function omittedCost(report: CostReport, list: "models" | "projects"): { costUsd: number; tokens: number } | null {
  const tokens = report.totals.tokens - report[list].reduce((sum, row) => sum + row.tokens, 0);
  if (tokens <= 0) return null;
  const costUsd = report.totals.costUsd - report[list].reduce((sum, row) => sum + row.costUsd, 0);
  return { costUsd: Math.max(0, costUsd), tokens };
}

/** True when the Host stopped at its log-file cap, so the whole report may miss older logs. */
export const isPartialScan = (report: CostReport): boolean => report.coverage.truncated === true;

const compactResetUnits = { day: "d", hour: "h", minute: "m" } as const;
type ResetUnits = Record<keyof typeof compactResetUnits, string>;

/** Countdown with the widget's compact formatting by default. */
export function resetCountdown(
  resetsAt: number | null,
  now: number,
  locale?: string,
  units?: ResetUnits,
): string | null {
  if (resetsAt === null) return null;
  const minutes = Math.max(0, Math.floor((resetsAt - now) / 60_000));
  if (resetsAt <= now) return null;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  // Native Intl can fall back to seconds for hours and minutes. Use the app's unit labels.
  const format = units ? numberFormat(locale).format : String;
  const suffixes = units ?? compactResetUnits;
  const separator = units ? " " : "";
  const unit = (value: number, name: keyof ResetUnits) => `${format(value)}${separator}${suffixes[name]}`;
  if (days > 0) return [unit(days, "day"), hours || !units ? unit(hours, "hour") : null].filter(Boolean).join(" ");
  const remainingMinutes = minutes % 60;
  if (hours > 0) return [unit(hours, "hour"), remainingMinutes || !units ? unit(remainingMinutes, "minute") : null].filter(Boolean).join(" ");
  return unit(Math.max(1, minutes), "minute");
}

/** Whole percent for display; a sliver is never rounded away to 0 or up to 100. */
export function wholePercent(value: number): number {
  const rounded = Math.round(value);
  if (rounded === 0 && value > 0) return 1;
  return rounded === 100 && value < 100 ? 99 : rounded;
}

/** US dollars in the app language: "$12.34", "$1.2K"; Turkish "$12,34", "$1,2 B". */
export function compactMoney(value: number, locale = "en"): string {
  const digits = value >= 100 ? 0 : 2;
  if (value < 1000)
    return numberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  const text = numberFormat(locale, { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
  // A runtime without compact notation prints the full amount; keep the reading short anyway.
  return text === numberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 1 }).format(value)
    ? `$${(value / 1000).toFixed(1)}k`
    : text;
}
