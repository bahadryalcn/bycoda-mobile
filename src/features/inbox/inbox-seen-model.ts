/** Desktop keeps seen records for 90 days (`inboxSeen.ts`); an unrecorded item older than that is not news. */
export const INBOX_SEEN_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export type InboxSeenItem = { id: string; updatedAt: number };
/** `seen` maps an item id to the `updatedAt` the owner last saw. */
export type InboxSeenState = { seeded: boolean; seen: Record<string, number> };
export const emptyInboxSeen: InboxSeenState = { seeded: false, seen: {} };

/** Mirrors desktop `unseenAgainst`: a changed item is unseen again, an unrecorded recent one is new. */
function itemUnseen(item: InboxSeenItem, seen: number | undefined, now: number): boolean {
  if (seen === undefined) return !Number.isFinite(item.updatedAt) || item.updatedAt >= now - INBOX_SEEN_RETENTION_MS;
  return item.updatedAt > seen;
}

/** Before the first sighting nothing is unseen (desktop seeds the store the same way). */
export function hasUnseenInboxItems(state: InboxSeenState, items: readonly InboxSeenItem[], now = Date.now()): boolean {
  return state.seeded && items.some((item) => itemUnseen(item, state.seen[item.id], now));
}

/** Records the listed items as seen, seeds the store, and drops records past retention. */
export function markInboxItemsSeen(state: InboxSeenState, items: readonly InboxSeenItem[], now = Date.now()): InboxSeenState {
  const cutoff = now - INBOX_SEEN_RETENTION_MS;
  const seen: Record<string, number> = {};
  for (const [id, value] of Object.entries(state.seen)) if (value >= cutoff) seen[id] = value;
  let changed = !state.seeded || Object.keys(seen).length !== Object.keys(state.seen).length;
  for (const item of items) {
    const value = Number.isFinite(item.updatedAt) ? item.updatedAt : now;
    if (seen[item.id] === undefined || value > seen[item.id]!) {
      seen[item.id] = value;
      changed = true;
    }
  }
  return changed ? { seeded: true, seen } : state;
}

export function normalizeInboxSeen(value: unknown): InboxSeenState {
  if (!value || typeof value !== "object") return emptyInboxSeen;
  const data = value as { seeded?: unknown; seen?: unknown };
  const seen: Record<string, number> = {};
  if (data.seen && typeof data.seen === "object")
    for (const [id, at] of Object.entries(data.seen)) if (typeof at === "number" && Number.isFinite(at)) seen[id] = at;
  return { seeded: data.seeded === true, seen };
}
