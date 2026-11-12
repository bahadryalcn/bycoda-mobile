import type { QueryCache } from "@tanstack/react-query";

/**
 * Newest successful read for one computer, for the connection pill.
 * The cache is scanned once; afterwards only success events for that computer's
 * `["machine", id, ...]` queries are looked at, so fetch starts, observer churn and
 * other computers' data cost nothing per cache event.
 * shortcut: the value never decreases when old queries are garbage-collected; the 30s
 * health poll keeps it fresh, upgrade if a consumer needs "oldest surviving" semantics.
 */
export function machineSuccessStore(cache: QueryCache, machineId: string | null) {
  let value = Math.max(
    0,
    ...cache.findAll({ queryKey: ["machine", machineId] }).map((query) => query.state.dataUpdatedAt),
  );
  const listeners = new Set<() => void>();
  let unsubscribe: (() => void) | undefined;
  const onEvent = (event: { type: string; query: { queryKey: readonly unknown[]; state: { dataUpdatedAt: number } } }) => {
    if (event.type !== "updated" && event.type !== "added") return;
    const key = event.query.queryKey;
    if (key[0] !== "machine" || key[1] !== machineId) return;
    const next = event.query.state.dataUpdatedAt;
    if (next <= value) return;
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
