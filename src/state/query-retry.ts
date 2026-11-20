/**
 * Reads that fail because the link is briefly down (Host restart, network switch) are retried quietly.
 * A deadline the Host itself reported is not: the Host is reachable but too slow, so every automatic
 * retry (query retries, quiet reconnect refetches, recovered-read refetches) would repeat the whole
 * wait. The error screen's Retry button stays the way to try again.
 */
export function isTransientConnectionError(error: unknown): boolean {
  const failure = error as
    | { kind?: string; category?: string; uncertain?: boolean; transient?: boolean; hostDeadline?: boolean }
    | null
    | undefined;
  // An uncertain failure may have applied a write; it is never replayed.
  if (failure?.uncertain) return false;
  if (failure?.hostDeadline) return false;
  // A raw socket failure (live streams surface it unwrapped) carries a category, not a kind.
  if (["overload", "unavailable", "network", "deadline"].includes(failure?.category ?? ""))
    return true;
  const kind = failure?.kind;
  // "aborted": a read cancelled because the socket was torn down mid-reconnect.
  return kind === "network" || kind === "timeout" || kind === "aborted" || failure?.transient === true;
}

/** Two quiet retries (about 1 s, 2 s) so one dropped request never shows an error. */
export const TRANSIENT_RETRY_LIMIT = 2;
/** A busy Host (a burst of reads over its per-device limit) clears within seconds: ~11 s quietly. */
export const BUSY_RETRY_LIMIT = 4;
export function retryTransientRead(failureCount: number, error: unknown): boolean {
  if (!isTransientConnectionError(error)) return false;
  const busy = (error as { transient?: boolean } | null)?.transient === true;
  return failureCount < (busy ? BUSY_RETRY_LIMIT : TRANSIENT_RETRY_LIMIT);
}
export function transientRetryDelay(failureCount: number): number {
  return Math.min(4_000, 1_000 * 2 ** failureCount);
}

/** Visible auto-refetch cadence while a transient error is showing: 3 s, 6 s, 12 s, capped at 15 s. */
export function reconnectRefetchDelay(attempt: number): number {
  return Math.min(15_000, 3_000 * 2 ** Math.max(0, attempt));
}

type RecoverableCache = {
  getQueryCache(): {
    findAll(filters: { queryKey: readonly unknown[] }): {
      queryKey: readonly unknown[];
      state: { status: string; error: unknown; errorUpdatedAt: number };
    }[];
  };
  refetchQueries(filters: {
    queryKey: readonly unknown[];
    exact: true;
    type: "active";
  }): Promise<unknown>;
};

/**
 * Once the computer answers again, reads that gave up during the outage (their quiet retries
 * ran out) load at once instead of leaving "Can't reach your computer" beside a connected pill.
 */
export function refetchRecoveredReads(cache: RecoverableCache, machineId: string, successAt: number) {
  for (const query of cache.getQueryCache().findAll({ queryKey: ["machine", machineId] })) {
    const { status, error, errorUpdatedAt } = query.state;
    if (status !== "error" || errorUpdatedAt >= successAt || !isTransientConnectionError(error))
      continue;
    void cache
      .refetchQueries({ queryKey: query.queryKey, exact: true, type: "active" })
      .catch(() => undefined);
  }
}
