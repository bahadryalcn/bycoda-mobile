import type { QueryCache } from "@tanstack/react-query";

/** Published successes are at most this much older than the newest; far below the pill's connected window. */
export const SUCCESS_GRANULARITY_MS = 5_000;

/**
 * Newest successful read for one computer, for the connection pill.
 * The cache is scanned once; afterwards only success events for that computer's
 * `["machine", id, ...]` queries are looked at, so fetch starts, observer churn and
 * other computers' data cost nothing per cache event.
 * shortcut: the value never decreases when old queries are garbage-collected; the 30s
 * health poll keeps it fresh, upgrade if a consumer needs "oldest surviving" semantics.
 */
export function machineSuccessStore(cache: QueryCache, machineId: string | null) {
  const initial = cache.findAll({ queryKey: ["machine", machineId] });
  let value = Math.max(0, ...initial.map((query) => query.state.dataUpdatedAt));
  // Newest failure seen for this computer; a success after it is published at once.
  let errorAt = Math.max(0, ...initial.map((query) => query.state.errorUpdatedAt ?? 0));
  const listeners = new Set<() => void>();
  let unsubscribe: (() => void) | undefined;
  const onEvent = (event: {
    type: string;
    query: { queryKey: readonly unknown[]; state: { dataUpdatedAt: number; errorUpdatedAt?: number } };
  }) => {
    if (event.type !== "updated" && event.type !== "added") return;
    const key = event.query.queryKey;
    if (key[0] !== "machine" || key[1] !== machineId) return;
    const failed = event.query.state.errorUpdatedAt ?? 0;
    if (failed > errorAt) errorAt = failed;
    const next = event.query.state.dataUpdatedAt;
    if (next <= value) return;
    // Streamed frames write these queries many times a second; consumers only need recency to
    // SUCCESS_GRANULARITY_MS, unless a failure since the last published success must be overturned.
    if (next - value < SUCCESS_GRANULARITY_MS && errorAt < value) return;
    value = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    getSnapshot: () => value,
    subscribe(listener: () => void) {
      listeners.add(listener);
      unsubscribe ??= cache.subscribe(onEvent as Parameters<QueryCache["subscribe"]>[0]);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          unsubscribe?.();
          unsubscribe = undefined;
        }
      };
    },
  };
}
