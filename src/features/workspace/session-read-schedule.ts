/** Long-poll re-arm gap while a turn runs. */
export const RUNNING_REARM_MS = 250;

/** Compatibility probing is per reader; an older host may ignore waitMs. */
export class SessionReadSchedule {
  private retryWaitAt = 0;
  waitMs(known: unknown, now = Date.now()) {
    return known && now >= this.retryWaitAt ? 20_000 : 0;
  }
  observe(previous: { revision: number } | undefined, current: { revision: number }, elapsed: number, waiting: number, now = Date.now()) {
    if (waiting && previous?.revision === current.revision && elapsed < 1_000)
      this.retryWaitAt = now + 60_000;
  }
  rejectWait(now = Date.now()) { this.retryWaitAt = now + 60_000; }
  /** `failures` is the consecutive failed reads; error cadence doubles per failure up to 30s. */
  delay(running: boolean, error: boolean, now = Date.now(), failures = 1) {
    if (error) return backoffMs(running ? 2_500 : 7_500, failures - 1, 30_000);
    // A running turn changes every Host batch, so its long poll answers at once; a short gap
    // coalesces several batches per read instead of re-reading back to back.
    return now < this.retryWaitAt ? (running ? 2_500 : 7_500) : running ? RUNNING_REARM_MS : 25;
  }
}

/** base * 2^attempt, capped. */
export function backoffMs(base: number, attempt: number, cap: number) {
  return Math.min(cap, base * 2 ** Math.max(0, Math.min(attempt, 16)));
}

export function unsupportedSessionWait(error: unknown) {
  const kind = error && typeof error === "object" && "kind" in error ? error.kind : undefined;
  return !["auth", "identity", "aborted"].includes(String(kind)) && error instanceof Error && /waitMs/i.test(error.message) && /unknown|unsupported|invalid|unexpected|not supported/i.test(error.message);
}

const schedules = new WeakMap<object, { identity: string; schedule: SessionReadSchedule }>();
/** All observers of one Query share compatibility state; removed Queries retain nothing. */
export function sessionReadSchedule(owner: object | undefined, identity: string) {
  if (!owner) return new SessionReadSchedule();
  let entry = schedules.get(owner);
  if (!entry || entry.identity !== identity) {
    entry = { identity, schedule: new SessionReadSchedule() };
    schedules.set(owner, entry);
  }
  return entry.schedule;
}
