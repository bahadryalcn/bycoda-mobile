/** Distance from the newest content at which the list keeps following streaming output. */
export const FOLLOW_THRESHOLD = 48;

export type FollowState = { following: boolean; dragging: boolean; momentum: boolean; heldByNavigation: boolean };
export type FollowEvent =
  | { type: "scroll"; distance: number }
  | { type: "beginDrag" }
  | { type: "endDrag"; distance: number; velocity?: number }
  | { type: "beginMomentum" }
  | { type: "endMomentum"; distance: number }
  | { type: "release" }
  | { type: "jump" };

export const initialFollowState: FollowState = { following: true, dragging: false, momentum: false, heldByNavigation: false };

/** Pixels between the viewport's end and the end of the content (never negative). */
export function distanceFromEnd(native: {
  contentOffset: { y: number };
  contentSize: { height: number };
  layoutMeasurement: { height: number };
  contentInset?: { bottom?: number };
}) {
  const bottom = native.contentInset?.bottom ?? 0;
  return Math.max(
    0,
    native.contentSize.height + bottom - native.layoutMeasurement.height - native.contentOffset.y,
  );
}

/**
 * Pure follow machine. Gestures and explicit navigation can leave the end.
 * Streaming tokens and newly measured rows can widen the distance without
 * dropping follow. Returning within the threshold resumes ordinary follow.
 */
export function nextFollowState(state: FollowState, event: FollowEvent): FollowState {
  // An animated find or citation jump can generate scroll and momentum events near the end.
  // Give the offset back only to a new gesture or Jump to latest.
  if (state.heldByNavigation && event.type !== "beginDrag" && event.type !== "jump") return state;
  const near = (distance: number) => distance <= FOLLOW_THRESHOLD;
  switch (event.type) {
    case "scroll":
      if (state.dragging || state.momentum) return { ...state, following: near(event.distance) };
      return near(event.distance) && !state.following ? { ...state, following: true } : state;
    case "beginDrag":
      // The finger owns the offset: stop pinning to the end until it is released near it.
      return { ...initialFollowState, following: false, dragging: true };
    case "endDrag": {
      const momentum = Math.abs(event.velocity ?? 0) > 0;
      return { ...initialFollowState, following: !momentum && near(event.distance), momentum };
    }
    case "beginMomentum":
      return { ...initialFollowState, following: false, momentum: true };
    case "endMomentum":
      return { ...initialFollowState, following: near(event.distance) };
    case "release":
      return { ...initialFollowState, following: false, heldByNavigation: true };
    case "jump":
      return initialFollowState;
  }
}

/** Lightweight route state (follow flag and history offset); holds no messages. */
export class TranscriptScrollPosition {
  private state = initialFollowState;
  private offset = 0;

  get following() {
    return this.state.following;
  }
  /** Offset from the top to restore after route hydration; undefined means start at the end. */
  restoreOffset() {
    this.state = { ...this.state, dragging: false, momentum: false };
    return this.state.following || this.offset <= 0 ? undefined : this.offset;
  }
  /** Returns true when the follow flag changed. */
  apply(event: FollowEvent, offset?: number) {
    if (offset !== undefined) this.offset = Math.max(0, offset);
    const before = this.state.following;
    this.state = nextFollowState(this.state, event);
    return this.state.following !== before;
  }
}
