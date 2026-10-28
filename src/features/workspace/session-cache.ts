import type { QueryClient } from "@tanstack/react-query";

const MAX_INACTIVE_SESSIONS = 3;
const MAX_INACTIVE_BYTES = 8 * 1024 * 1024;

/** Approximate retained text/object weight, without serializing large payloads. */
function dataBytes(data: unknown): number {
  const seen = new WeakSet<object>();
  const stack: Iterator<unknown>[] = [[data][Symbol.iterator]()];
  let bytes = 0;
  while (stack.length && bytes <= MAX_INACTIVE_BYTES) {
    const next = stack[stack.length - 1]!.next();
    if (next.done) {
      stack.pop();
      continue;
    }
    const value = next.value;
    if (typeof value === "string") {
      bytes += value.length * 2 + 16;
      continue;
    }
    if (!value || typeof value !== "object") {
      bytes += 8;
      continue;
    }
    if (seen.has(value)) continue;
    seen.add(value);
    bytes += 64;
    stack.push((Array.isArray(value) ? value : Object.values(value))[Symbol.iterator]());
  }
  return bytes;
}

/** Routes detach their payload observer before calling this. Active or fetching
 * queries are never evicted; drafts, receipts and navigation state are separate. */
export function pruneInactiveSessionCache(cache: QueryClient): void {
  const queries = cache
    .getQueryCache()
    .getAll()
    .filter((query) => {
      const key = query.queryKey;
      return (
        key[0] === "machine" &&
        (key[2] === "session" || key[2] === "session-block") &&
        query.getObserversCount() === 0 &&
        query.state.fetchStatus !== "fetching"
      );
    })
    .sort((left, right) => right.state.dataUpdatedAt - left.state.dataUpdatedAt);
  let sessions = 0;
  let bytes = 0;
  for (const query of queries) {
    const weight = dataBytes(query.state.data);
    const count = query.queryKey[2] === "session" ? 1 : 0;
    if (sessions + count > MAX_INACTIVE_SESSIONS || bytes + weight > MAX_INACTIVE_BYTES) {
      cache.removeQueries({ queryKey: query.queryKey, exact: true });
    } else {
      sessions += count;
      bytes += weight;
    }
  }
}
