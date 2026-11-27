import { numberFormat } from "../../../../src/shared/i18n/numberFormat";
import type { SessionUsageReport } from "./usage-model";

type Metrics = SessionUsageReport["totals"];
export type TokenKind = "input" | "output" | "cacheRead" | "cacheWrite";
const fields: readonly [TokenKind, keyof Metrics][] = [
  ["input", "inputTokens"], ["output", "outputTokens"], ["cacheRead", "cacheReadTokens"], ["cacheWrite", "cacheWriteTokens"],
];

/** Sum of the token readings the provider reported; null when none was reported (unknown is not zero). */
export function totalTokens(metrics: Metrics): number | null {
  let sum: number | null = null;
  for (const [, key] of fields) {
    const value = metrics[key];
    if (typeof value === "number") sum = (sum ?? 0) + value;
  }
  return sum;
}

/** Reported token kinds with their share of the reported total (0..1); unreported kinds are omitted. */
export function tokenSplit(metrics: Metrics): { kind: TokenKind; value: number; share: number }[] {
  const total = totalTokens(metrics) ?? 0;
  return fields.flatMap(([kind, key]) => {
    const value = metrics[key];
    return typeof value === "number" ? [{ kind, value, share: total > 0 ? value / total : 0 }] : [];
  });
}

export type ProviderUsage = { provider: string; sessions: number; turns: number; tokens: number | null; share: number };

/** Aggregate the page's session rows by provider, largest first. Share is relative to the largest provider. */
export function providerUsage(rows: SessionUsageReport["rows"]): ProviderUsage[] {
  const map = new Map<string, Omit<ProviderUsage, "share">>();
  for (const row of rows) {
    const current = map.get(row.provider) ?? { provider: row.provider, sessions: 0, turns: 0, tokens: null };
    const tokens = totalTokens(row);
    map.set(row.provider, {
      ...current,
      sessions: current.sessions + 1,
      turns: current.turns + row.turns,
      tokens: tokens === null ? current.tokens : (current.tokens ?? 0) + tokens,
    });
  }
  const list = [...map.values()].sort((a, b) => (b.tokens ?? -1) - (a.tokens ?? -1) || b.turns - a.turns || a.provider.localeCompare(b.provider));
  const max = Math.max(0, ...list.map((entry) => entry.tokens ?? 0));
  return list.map((entry) => ({ ...entry, share: max > 0 && entry.tokens !== null ? entry.tokens / max : 0 }));
}

/**
 * Compact reading in the app language ("1.2K"; Turkish "1,2 B" for thousand, "3,4 Mr" for billion):
 * a fixed K/M/B suffix misreads where "B" means thousand. Exact values stay in the detail rows.
 */
export function compactTokens(value: number | null, locale = "en"): string {
  if (value === null) return "—";
  if (value < 1000) return numberFormat(locale).format(value);
  const text = numberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
  // A runtime without compact notation prints the full number; keep the reading short anyway.
  return text === numberFormat(locale, { maximumFractionDigits: 1 }).format(value) ? legacyCompact(value) : text;
}

function legacyCompact(value: number): string {
  const units: [number, string][] = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [size, suffix] of units) {
    if (value >= size) {
      const scaled = value / size;
      return `${scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10}${suffix}`;
    }
  }
  return String(value);
}

/** Short id shown as secondary text; a session has no title in the usage report, so the id never stands alone as one. */
export function shortSessionId(sessionId: string): string {
  return sessionId.length > 8 ? sessionId.slice(0, 8) : sessionId;
}
