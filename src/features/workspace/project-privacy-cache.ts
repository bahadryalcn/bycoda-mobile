import type { Query, QueryClient } from "@tanstack/react-query";
export const projectPrivacyKey = (machineId: string, grouped: boolean) => ["machine", machineId, "projects", ...(grouped ? ["directory"] : []), { method: grouped ? "projects.directory" : "projects.list", params: {} }];
export function isProjectPrivacyQuery(queryKey: readonly unknown[], machineId?: string) {
  return queryKey[0] === "machine" &&
    (machineId === undefined || queryKey[1] === machineId) &&
    queryKey[2] === "projects" &&
    (queryKey[3] === "directory" || !!queryKey[3] && typeof queryKey[3] === "object" &&
      "method" in queryKey[3] && queryKey[3].method === "projects.list");
}

// Proof belongs to a cache entry, not a mounted screen or a reusable key string.
// Observe every state change so batched errors and closed screens cannot erase denial.
const denied = new WeakSet<object>();
const expired = new WeakSet<object>();
const blockedVersion = new WeakMap<object, number>();
const tracked = new WeakSet<object>();
const proofListeners = new WeakMap<object, Set<() => void>>();
function block(query: Query, target: WeakSet<object>) {
  target.add(query);
  blockedVersion.set(query, Math.max(blockedVersion.get(query) ?? -1, query.state.dataUpdateCount));
}
function observeVisibility(query: Query, explicit = false, initial = false) {
  if (!isProjectPrivacyQuery(query.queryKey)) return;
  const state = query.state;
  // Query-core also marks ordinary fetch errors as invalidated. Only explicit
  // invalidation (or unobserved restored proof) expires otherwise proven data.
  if (explicit || initial && state.isInvalidated) block(query, expired);
  if (["auth", "identity"].includes((state.error as { kind?: string } | null)?.kind ?? "")) block(query, denied);
  else if (state.status === "success" && !state.error && state.fetchStatus === "idle" && !state.isInvalidated &&
    state.dataUpdateCount > (blockedVersion.get(query) ?? -1)) {
    denied.delete(query); expired.delete(query); blockedVersion.delete(query);
  }
}
export function observeProjectPrivacy(cache: QueryClient): QueryClient {
  const queries = cache.getQueryCache();
  if (!tracked.has(queries)) {
    tracked.add(queries);
    queries.getAll().forEach(query => observeVisibility(query, false, true));
    // The cache owns this listener. Weak keys do not extend QueryClient/Query lifetime.
    queries.subscribe(event => {
      if (event.type === "added") observeVisibility(event.query, false, true);
      else if (event.type === "updated") observeVisibility(event.query, event.action.type === "invalidate");
    });
  }
  return cache;
}
export function subscribeProjectPrivacy(cache: QueryClient, notify: () => void): () => void {
  const queries = observeProjectPrivacy(cache).getQueryCache();
  let listeners = proofListeners.get(queries);
  if (!listeners) { listeners = new Set(); proofListeners.set(queries, listeners); }
  listeners.add(notify);
  return () => { listeners.delete(notify); };
}
export function projectVisibilityExpired(cache: QueryClient, key: readonly unknown[]): boolean {
  const owner = observeProjectPrivacy(cache).getQueryCache().find({ queryKey: key, exact: true });
  return !!owner && expired.has(owner);
}
export function projectVisibilityDenied(cache: QueryClient, key: readonly unknown[]): boolean {
  const owner = observeProjectPrivacy(cache).getQueryCache().find({ queryKey: key, exact: true });
  if (!owner) return true;
  observeVisibility(owner);
  return denied.has(owner);
}
export function expireProjectPrivacy(cache: QueryClient, entries: readonly Query[]): void {
  const queries = observeProjectPrivacy(cache).getQueryCache();
  const affected = entries.filter(query => isProjectPrivacyQuery(query.queryKey));
  affected.forEach(query => block(query, expired));
  if (affected.length) [...(proofListeners.get(queries) ?? [])].forEach(notify => notify());
}
/** Expire visibility proof, not transcripts/drafts, without background refetches. */
export async function invalidateProjectPrivacy(cache: QueryClient, machineId?: string) {
  const predicate = ({ queryKey }: { queryKey: readonly unknown[] }) => isProjectPrivacyQuery(queryKey, machineId);
  const queries = observeProjectPrivacy(cache).getQueryCache();
  // A previous fetch error may already have set isInvalidated, so query.invalidate
  // need not emit another event. Publish this independent privacy transition.
  expireProjectPrivacy(cache, queries.findAll({ predicate }));
  // Cancel the retryer before marking the proof expired: an old response must
  // not clear invalidation and restore visibility after a lock/consent change.
  await cache.cancelQueries({ predicate });
  await cache.invalidateQueries({ refetchType: "none", predicate });
}
