/**
 * Usage widget refresh policy. expo-widgets cannot report whether a widget kind is placed, so the
 * publisher polls only while the app is in the foreground and unlocked, and at most once per interval.
 */
export const USAGE_WIDGET_POLL_MS = 10 * 60_000;

export type UsagePollInput = {
  /** The computer advertises `usage.limits.read` and has an environment id. */
  supported: boolean;
  /** Unlocked and signed in. */
  gated: boolean;
  focused: boolean;
  /** Epoch ms of the last poll this publisher started, or 0 when none. */
  lastFetchAt: number;
  now: number;
};

/** Whether the shared usage query should be refetched now. */
export function isUsagePollDue({ supported, gated, focused, lastFetchAt, now }: UsagePollInput): boolean {
  if (!supported || !gated || !focused) return false;
  return lastFetchAt === 0 || now - lastFetchAt >= USAGE_WIDGET_POLL_MS;
}
