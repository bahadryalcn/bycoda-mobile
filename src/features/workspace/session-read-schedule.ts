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
  delay(running: boolean, error: boolean, now = Date.now()) {
    return error || now < this.retryWaitAt ? (running ? 2_500 : 7_500) : 25;
  }
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
