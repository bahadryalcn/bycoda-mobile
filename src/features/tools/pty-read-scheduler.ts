type ReadResult = { output: boolean; hasMore: boolean } | undefined;

/** One read owner; the renderer ACK remains the only permission to drain again. */
export class PtyReadScheduler {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private live = true;
  private reading = false;
  private requested = false;
  private idleDelay = 200;
  constructor(private readonly ready: () => boolean, private readonly read: () => Promise<ReadResult>) {}
  wake = () => {
    if (!this.live) return;
    this.requested = true;
    this.idleDelay = 200;
    if (!this.reading) this.schedule(0);
  };
  private schedule(delay: number) {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; void this.run(); }, delay);
  }
  private async run() {
    if (!this.live || this.reading || !this.ready()) return;
    this.reading = true;
    this.requested = false;
    try {
      const result = await this.read();
      if (!this.live || !result) return;
      if (result.output || result.hasMore) this.idleDelay = 200;
      else this.idleDelay = Math.min(2_000, this.idleDelay * 2);
      // ACK can arrive while read() is settling. In that case wake() is retained.
      if (this.ready()) this.schedule(this.requested || result.hasMore ? 0 : this.idleDelay);
    } finally { this.reading = false; }
  }
  stop() {
    this.live = false;
    if (this.timer !== undefined) clearTimeout(this.timer);
  }
}
