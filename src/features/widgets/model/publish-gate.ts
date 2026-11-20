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
