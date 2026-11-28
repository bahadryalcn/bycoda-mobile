import type { HostSession } from "./wire";

/**
 * A reopened stream (a reconnect, a return from the background) starts again on its newest page. The
 * transcript already on screen stays: when nothing changed it is kept as it is, and otherwise only
 * what changed is read on top of it (`sessions.sync`), instead of reading every earlier page again.
 * The merge is used only when it lands on the stream's own revision, so later stream deltas still
 * follow it; anything else falls back to the stream's snapshot.
 */
export async function keepLoadedHistory(
  snapshot: HostSession,
  known: HostSession | undefined,
  readChanges: (known: HostSession) => Promise<HostSession>,
): Promise<HostSession> {
  const fresh = snapshot.history?.before;
  // No earlier cursor on the held transcript means it already holds the whole history.
  const loaded = known?.history?.before;
  if (!known || known.session.id !== snapshot.session.id || fresh === undefined || (loaded !== undefined && loaded >= fresh))
    return snapshot;
  if (known.revision === snapshot.revision) return known;
  if (known.revision > snapshot.revision) return snapshot;
  try {
    const merged = await readChanges(known);
    return merged.revision === snapshot.revision && merged.session.id === snapshot.session.id ? merged : snapshot;
  } catch {
    return snapshot;
  }
}
