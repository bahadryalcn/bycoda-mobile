import { attentionIdentity, SNAPSHOT_TTL_MS, type WidgetSnapshot } from "./snapshot";

/** What the session-widget publisher does for one effect run. */
export type PublishStep = "skip" | "publish" | "retire";

export type PublishRecord = { identity: string; at: number };

/**
 * Decides one publisher run from the last claimed publication. `identity` is null when no
 * snapshot is ready. "retire" means something visible changed: queued and in-flight writes
 * for the old state must be dropped. An unchanged identity never retires in-flight writes;
 * it only republishes once the heartbeat is due.
 */
export function nextPublishStep(
  last: PublishRecord,
  identity: string | null,
  now: number,
  heartbeatMs: number,
): PublishStep {
  if (identity === null) return last.identity === "" ? "skip" : "retire";
  if (identity !== last.identity) return "retire";
  return now - last.at < heartbeatMs ? "skip" : "publish";
}

/** NeedsAttention is refreshed once its published snapshot has this little left before it expires. */
const ATTENTION_REFRESH_MS = SNAPSHOT_TTL_MS - 4 * 60_000;
let attentionPublished = { identity: "", expiresAt: 0 };

/**
 * Whether the NeedsAttention widget needs this snapshot. Changes outside its own slice (running
 * and done rows) are skipped while its last published snapshot is still well within its lifetime,
 * so it is still refreshed before it would show as stale.
 */
export function attentionPublishDue(snapshot: WidgetSnapshot, now = Date.now()): boolean {
  return (
    attentionIdentity(snapshot) !== attentionPublished.identity ||
    attentionPublished.expiresAt - now <= ATTENTION_REFRESH_MS
  );
}

export function markAttentionPublished(snapshot: WidgetSnapshot): void {
  attentionPublished = { identity: attentionIdentity(snapshot), expiresAt: snapshot.expiresAt };
}
