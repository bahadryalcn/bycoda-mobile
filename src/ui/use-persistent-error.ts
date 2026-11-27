import { useEffect, useState } from "react";
import { READ_RETRY_GRACE_MS } from "../state/query-retry";
import { useHostForegroundGeneration } from "../state/host-runtime-state";

/** Shown data whose background refresh keeps failing is reported only after this long. */
export const STALE_ERROR_REVEAL_MS = 60_000;

/** Failures that retrying cannot fix: they show at once (access, identity, outdated computer). */
const LASTING_KINDS = new Set(["auth", "identity", "unsupported"]);

export type PersistentErrorOptions = {
  /** Useful content is on screen: a failed background refresh stays quiet much longer. */
  hasData?: boolean;
  /** The person just asked for this (Save, Send, Retry): its failure is reported at once. */
  userInitiated?: boolean;
  /** Override the grace for a failure that is neither lasting nor user-initiated. */
  graceMs?: number;
};

/**
 * How long a failure must last before it is shown. A failure that resolves itself inside this
 * window (a reconnect, a poll that fails once, a timeout while the app resumes) is never shown.
 */
export function errorRevealDelay(error: unknown, options: PersistentErrorOptions = {}): number {
  if (!error || options.userInitiated) return 0;
  const kind = (error as { kind?: string } | null)?.kind;
  if (kind && LASTING_KINDS.has(kind)) return 0;
  return options.graceMs ?? (options.hasData ? STALE_ERROR_REVEAL_MS : READ_RETRY_GRACE_MS);
}

/**
 * True once `active` has stayed true for `delayMs`; false again as soon as it ends. A return to the
 * foreground starts the wait over, because the socket reconnects before anything can load.
 */
export function usePersistentCondition(active: boolean, delayMs: number = READ_RETRY_GRACE_MS): boolean {
  const generation = useHostForegroundGeneration();
  const [revealed, setRevealed] = useState<number | null>(null);
  useEffect(() => {
    setRevealed(null);
    if (!active || delayMs <= 0) return;
    const timer = setTimeout(() => setRevealed(generation), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs, generation]);
  return active && (delayMs <= 0 || revealed === generation);
}

/**
 * The single rule for failures that are not reported through `QueryState`: show the error only when
 * it persists, is lasting, or was caused by the person's own action, and drop it as soon as the
 * condition recovers. Returns the error to render, or null.
 */
export function usePersistentError<T>(error: T | null | undefined, options: PersistentErrorOptions = {}): T | null {
  const delay = errorRevealDelay(error, options);
  const visible = usePersistentCondition(!!error, delay);
  return error && visible ? error : null;
}
