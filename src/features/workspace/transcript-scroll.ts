/** Initial hydration follows the newest message; a user's history browsing owns the scroll. */
export class TranscriptScrollPosition {
  private following = true;
  private dragging = false;
  private momentum = false;
  private offset = 0;

  /** Lightweight route state; contains no messages or render objects. */
  restoreOffset() {
    this.dragging = false;
    this.momentum = false;
    return this.following ? 0 : this.offset;
  }

  onScroll(offset: number) {
    this.offset = Math.max(0, offset);
    if (!this.dragging && !this.momentum) this.following = this.offset <= 32;
  }
  beginDrag() {
    this.dragging = true;
    this.momentum = false;
    this.following = false;
  }
  endDrag(offset = this.offset, velocity = 0) {
    this.onScroll(offset);
    this.dragging = false;
    this.momentum = Math.abs(velocity) > 0;
    this.following = !this.momentum && this.offset <= 32;
  }
  beginMomentum() {
    this.momentum = true;
    this.following = false;
  }
  endMomentum(offset: number) {
    this.momentum = false;
    this.onScroll(offset);
  }
  jumpToLatest() {
    this.offset = 0;
    this.dragging = false;
    this.momentum = false;
    this.following = true;
  }
  shouldAnchor(hasMessages: boolean) {
    return hasMessages && this.following && !this.dragging && !this.momentum;
  }
}
