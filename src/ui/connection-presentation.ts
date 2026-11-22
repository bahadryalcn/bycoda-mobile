import { READ_RETRY_GRACE_MS } from "../state/query-retry";

export type ConnectionPhase =
  | "unpaired"
  | "offline"
  | "locked"
  | "permission"
  | "access"
  | "storage"
  | "startup-failed"
  | "checking"
  | "connected"
  | "disconnected";
/** How long a successful RPC keeps the link "connected" before it must be re-proven. */
export const CONNECTED_WINDOW_MS = 45_000;

/** A saved computer is not evidence of a live connection. Recent successful RPC is. */
export function connectionPhase(input: {
  paired: boolean;
  networkConnected: boolean | null;
  unlocked: boolean;
  permitted: boolean;
  storageError?: string | null;
  startupFailed?: boolean;
  /** The computer refused this device key (revoked or replaced); reconnecting will not fix it. */
  accessDenied?: boolean;
  successAt: number;
  errorAt: number;
  now: number;
  /** A health probe has been in flight past the stall limit; the link is unproven until it answers. */
  probeStalled?: boolean;
  /**
   * Live Host socket state of this computer. When it names a live attempt, outcome or refusal it
   * decides the phase; any other value (or none: legacy HTTP, web, no lease) falls back to the
   * describe poll below.
   */
  runtime?: string | null;
  /** Start of the current reconnect cycle; a short drop reads as checking until its grace ends. */
  recoveringSince?: number | null;
}): ConnectionPhase {
  if (!input.paired) return "unpaired";
  if (input.networkConnected === false) return "offline";
  if (!input.unlocked) return "locked";
  if (input.storageError) return "storage";
  if (!input.permitted) return "permission";
  if (input.startupFailed) return "startup-failed";
  switch (input.runtime) {
    case "ready":
      return "connected";
    case "connecting":
      return "checking";
    case "backoff":
      return input.recoveringSince != null && input.now - input.recoveringSince < READ_RETRY_GRACE_MS
        ? "checking"
        : "disconnected";
    case "blocked":
      return input.accessDenied && input.errorAt >= input.successAt ? "access" : "disconnected";
  }
  if (input.accessDenied && input.errorAt && input.errorAt >= input.successAt) return "access";
  if (input.errorAt && input.errorAt >= input.successAt) return "disconnected";
  if (input.probeStalled) return "checking";
  if (input.successAt > 0 && input.now - input.successAt < CONNECTED_WINDOW_MS) return "connected";
  return "checking";
}
