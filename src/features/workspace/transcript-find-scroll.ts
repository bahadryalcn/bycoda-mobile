/** Bounded recovery for variable-height virtualized rows, keyed by stable entry identity. */
export class TranscriptFindScroll {
  private target: string | null = null;
  private attempts = 0;
  select(entryId: string) { this.target = entryId; this.attempts = 0; }
  cancel() { this.target = null; this.attempts = 0; }
  index(entries: readonly { id: string }[]) {
    return this.target === null ? -1 : entries.findIndex((entry) => entry.id === this.target);
  }
  retry(entries: readonly { id: string }[]) {
    if (this.target === null || this.attempts >= 4) return undefined;
    const index = this.index(entries);
    if (index < 0) { this.cancel(); return undefined; }
    this.attempts++;
    return index;
  }
}
