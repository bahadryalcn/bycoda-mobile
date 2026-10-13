/** Initial hydration follows the newest message; a user's history browsing owns the scroll. */
export class TranscriptScrollPosition {
  private following = true;
  private dragging = false;
  private offset = 0;

  onScroll(offset: number) {
    this.offset = Math.max(0, offset);
    if (!this.dragging) this.following = this.offset <= 32;
  }
  beginDrag() {
    this.dragging = true;
    this.following = false;
  }
  endDrag() {
    this.dragging = false;
    this.following = this.offset <= 32;
  }
  jumpToLatest() {
    this.offset = 0;
    this.following = true;
  }
  shouldAnchor(hasMessages: boolean) {
    return hasMessages && this.following && !this.dragging;
  }
}
