import { describe, expect, it } from "vitest";
import {
  distanceFromEnd,
  FOLLOW_THRESHOLD,
  initialFollowState,
  nextFollowState,
  TranscriptScrollPosition,
  type FollowEvent,
} from "./transcript-scroll";

const run = (events: FollowEvent[], state = initialFollowState) =>
  events.reduce(nextFollowState, state);

describe("transcript follow state machine", () => {
  it("starts following and keeps following while streaming grows the content", () => {
    expect(initialFollowState.following).toBe(true);
    // Growth widens the distance without a gesture: still following.
    expect(run([{ type: "scroll", distance: 300 }]).following).toBe(true);
  });
  it("stops following when the user drags and preserves position while content grows", () => {
    const state = run([{ type: "beginDrag" }, { type: "scroll", distance: 120 }]);
    expect(state.following).toBe(false);
    // A programmatic scroll event away from the end never re-enables following.
    const settled = run([{ type: "endDrag", distance: 120 }, { type: "scroll", distance: 400 }]);
    expect(settled.following).toBe(false);
  });
  it("resumes following when scrolled back to the end by the user or by a jump", () => {
    const away = run([{ type: "beginDrag" }, { type: "endDrag", distance: 500 }]);
    expect(away.following).toBe(false);
    expect(nextFollowState(away, { type: "scroll", distance: FOLLOW_THRESHOLD }).following).toBe(true);
    expect(nextFollowState(away, { type: "jump" })).toEqual(initialFollowState);
  });
  it("does not resume mid fling and resumes when momentum ends at the end", () => {
    let state = run([{ type: "beginDrag" }, { type: "endDrag", distance: 10, velocity: 1.4 }]);
    expect(state.following).toBe(false);
    state = run([{ type: "beginMomentum" }, { type: "scroll", distance: 600 }], state);
    expect(state.following).toBe(false);
    expect(nextFollowState(state, { type: "endMomentum", distance: 4 }).following).toBe(true);
    expect(nextFollowState(state, { type: "endMomentum", distance: 300 }).following).toBe(false);
  });
  it("does not follow again when a find or citation jump scrolls near the end", () => {
    const released = run([{ type: "release" }]);
    expect(released.following).toBe(false);
    expect(nextFollowState(released, { type: "scroll", distance: 0 }).following).toBe(false);
    expect(run([
      { type: "beginMomentum" },
      { type: "scroll", distance: 0 },
      { type: "endMomentum", distance: 0 },
    ], released).following).toBe(false);
  });
  it("allows an explicit drag or Jump to latest to resume following after list navigation", () => {
    const released = run([{ type: "release" }]);
    const dragged = run([
      { type: "beginDrag" },
      { type: "endDrag", distance: 0 },
    ], released);
    expect(dragged.following).toBe(true);
    expect(nextFollowState(released, { type: "jump" })).toEqual(initialFollowState);
  });
  it("measures distance from the end including the bottom inset", () => {
    const native = {
      contentOffset: { y: 100 },
      contentSize: { height: 1000 },
      layoutMeasurement: { height: 600 },
    };
    expect(distanceFromEnd(native)).toBe(300);
    expect(distanceFromEnd({ ...native, contentInset: { bottom: 20 } })).toBe(320);
    expect(distanceFromEnd({ ...native, contentOffset: { y: 900 } })).toBe(0);
  });
});

describe("transcript route position", () => {
  it("restores a history offset only when the user was browsing away from the end", () => {
    const position = new TranscriptScrollPosition();
    expect(position.restoreOffset()).toBeUndefined();
    position.apply({ type: "beginDrag" }, 420);
    expect(position.apply({ type: "endDrag", distance: 800 }, 420)).toBe(false);
    expect(position.restoreOffset()).toBe(420);
    expect(position.following).toBe(false);
    expect(position.apply({ type: "jump" }, 0)).toBe(true);
    expect(position.restoreOffset()).toBeUndefined();
  });
  it("reports follow flag changes so the screen re-renders only on transitions", () => {
    const position = new TranscriptScrollPosition();
    expect(position.apply({ type: "scroll", distance: 0 })).toBe(false);
    expect(position.apply({ type: "beginDrag" })).toBe(true);
    expect(position.apply({ type: "scroll", distance: 2 })).toBe(true);
  });
});
