import type { PrChecks } from "./results";

/** The check states the desktop reports (`gh pr checks` buckets); anything else is "unknown". */
export type PrCheckBucket = "fail" | "pending" | "pass" | "skipping" | "cancel" | "unknown";
const BUCKETS: readonly PrCheckBucket[] = ["fail", "pending", "pass", "skipping", "cancel", "unknown"];

export function prCheckBucket(state: string): PrCheckBucket {
  const value = state.toLowerCase() as PrCheckBucket;
  return BUCKETS.includes(value) ? value : "unknown";
}

/** Counts per bucket in reading order (failures first), omitting empty buckets. */
export function prChecksSummary(checks: PrChecks["checks"]): { bucket: PrCheckBucket; count: number }[] {
  const counts = new Map<PrCheckBucket, number>();
  for (const check of checks) counts.set(prCheckBucket(check.state), (counts.get(prCheckBucket(check.state)) ?? 0) + 1);
  return BUCKETS.flatMap(bucket => counts.get(bucket) ? [{ bucket, count: counts.get(bucket)! }] : []);
}

/** Failures first, then running, then the rest; the provider order is kept within a bucket. */
export function sortPrChecks<T extends { state: string }>(checks: readonly T[]): T[] {
  return checks.map((check, index) => ({ check, index }))
    .sort((a, b) => BUCKETS.indexOf(prCheckBucket(a.check.state)) - BUCKETS.indexOf(prCheckBucket(b.check.state)) || a.index - b.index)
    .map(({ check }) => check);
}

/** A check link is opened only when it is an https URL. */
export function prCheckUrl(url: string | null | undefined): string | undefined {
  return url && /^https:\/\//i.test(url) ? url : undefined;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}
