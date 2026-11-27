type ReadResult = { output: boolean; hasMore: boolean } | undefined;

/** Minimum spacing between read starts when a renderer ACK (not input) asks for more output. */
export const PTY_ACK_READ_INTERVAL_MS = 150;
const IDLE_BACKOFF_MS = 2_000;
/** After this long with no output and no input, an idle terminal is read less often. */
const LONG_IDLE_AFTER_MS = 30_000;
const LONG_IDLE_BACKOFF_MS = 5_000;

/** One read owner; the renderer ACK remains the only permission to drain again. */
export class PtyReadScheduler {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private due = 0;
  private live = true;
  private reading = false;
  private requested = false;
  /** Input or resize asked for a read; it never waits behind the ACK spacing. */
  private urgent = false;
  private lastHasMore = false;
  private lastReadStartedAt = -Infinity;
  private lastActivityAt = Date.now();
  private idleDelay = 200;
  constructor(private readonly ready: () => boolean, private readonly read: () => Promise<ReadResult>) {}
  /** Input, resize and attach: read now so typing echo stays immediate. */
  wake = () => {
    if (!this.live) return;
    this.requested = true;
    this.urgent = true;
    this.idleDelay = 200;
    this.lastActivityAt = Date.now();
    if (!this.reading) this.schedule(0);
  };
  /**
   * The renderer showed a chunk. A paged burst keeps draining at once; steady small output
   * (spinners, progress bars, `top`) is batched into reads spaced by the ACK interval.
   */
  wakeAfterAck = () => {
    if (!this.live) return;
    this.requested = true;
    this.idleDelay = 200;
    if (this.reading) return;
    const delay = this.ackDelay();
    // Never postpone a read that is already due sooner.
    if (this.timer !== undefined && this.due <= Date.now() + delay) return;
    this.schedule(delay);
  };
  private ackDelay() {
    if (this.urgent || this.lastHasMore) return 0;
    return Math.max(0, this.lastReadStartedAt + PTY_ACK_READ_INTERVAL_MS - Date.now());
  }
  private schedule(delay: number) {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.due = Date.now() + delay;
    this.timer = setTimeout(() => { this.timer = undefined; void this.run(); }, delay);
  }
  private async run() {
    if (!this.live || this.reading || !this.ready()) return;
    this.reading = true;
    this.requested = false;
    this.urgent = false;
    this.lastReadStartedAt = Date.now();
    try {
      const result = await this.read();
      if (!this.live || !result) return;
      this.lastHasMore = result.hasMore;
      if (result.output || result.hasMore) {
        this.idleDelay = 200;
        this.lastActivityAt = Date.now();
      } else {
        const cap = Date.now() - this.lastActivityAt >= LONG_IDLE_AFTER_MS ? LONG_IDLE_BACKOFF_MS : IDLE_BACKOFF_MS;
        this.idleDelay = Math.min(cap, this.idleDelay * 2);
      }
      // ACK or input can arrive while read() is settling. In that case the wake is retained.
      if (this.ready()) this.schedule(result.hasMore ? 0 : this.requested ? this.ackDelay() : this.idleDelay);
    } finally { this.reading = false; }
  }
  stop() {
    this.live = false;
    if (this.timer !== undefined) clearTimeout(this.timer);
  }
}
