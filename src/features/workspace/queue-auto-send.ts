import type { HostSession } from "./wire";

/** Safety net only; the normal trigger is the session leaving `running` in the shared snapshot. */
export const AUTO_SEND_SAFETY_MS = 15_000;
/** How long a running snapshot fed by the stream or the snapshot poll is trusted without a live read. */
export const RUNNING_TRUST_MS = 30_000;

/**
 * An automatic attempt needs no Host request while the open transcript's authoritative snapshot
 * (stream push or snapshot poll) already shows a recent running turn. Anything else, including a
 * missing, idle or old snapshot, reads live at dispatch time so a stale idle never sends.
 */
export function automaticAttemptCanWait(
  cached: Pick<HostSession, "status"> | undefined,
  updatedAt: number,
  now: number,
): boolean {
  return cached?.status === "running" && updatedAt > 0 && now - updatedAt < RUNNING_TRUST_MS;
}
