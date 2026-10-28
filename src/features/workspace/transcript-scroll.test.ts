import { describe, expect, it } from "vitest";
import { TranscriptScrollPosition } from "./transcript-scroll";

describe("transcript scroll ownership", () => {
  it("retains a lightweight history offset across route hydration", () => {
    const position = new TranscriptScrollPosition();
    position.beginDrag();
    position.onScroll(420);
    position.endDrag(420);
    expect(position.restoreOffset()).toBe(420);
    expect(position.shouldAnchor(true)).toBe(false);
    position.jumpToLatest();
    expect(position.restoreOffset()).toBe(0);
    expect(position.shouldAnchor(true)).toBe(true);
  });
  it("does not interrupt a fling near the newest message when streaming updates arrive", () => {
    const position = new TranscriptScrollPosition();
    position.beginDrag();
    position.endDrag(12, 1.2);
    expect(position.shouldAnchor(true)).toBe(false);
    position.beginMomentum();
    position.onScroll(24);
    expect(position.shouldAnchor(true)).toBe(false);
    position.endMomentum(420);
    expect(position.shouldAnchor(true)).toBe(false);
  });
  it("resumes streaming follow only after momentum finishes at the latest message", () => {
    const position = new TranscriptScrollPosition();
    position.beginDrag();
    position.endDrag(200, -1);
    position.beginMomentum();
    position.onScroll(8);
    expect(position.shouldAnchor(true)).toBe(false);
    position.endMomentum(0);
    expect(position.shouldAnchor(true)).toBe(true);
  });
  it("uses the release position even if the final scroll event was throttled", () => {
    const position = new TranscriptScrollPosition();
    position.beginDrag();
    position.onScroll(0);
    position.endDrag(120);
    expect(position.shouldAnchor(true)).toBe(false);
  });
  it("anchors after async hydration and follows streaming content", () => {
    const position = new TranscriptScrollPosition();
    expect(position.shouldAnchor(false)).toBe(false);
    expect(position.shouldAnchor(true)).toBe(true);
    position.onScroll(0);
    expect(position.shouldAnchor(true)).toBe(true);
  });
  it("keeps older messages in view when history loads or messages arrive", () => {
    const position = new TranscriptScrollPosition();
    position.beginDrag();
    expect(position.shouldAnchor(true)).toBe(false);
    position.onScroll(420);
    position.endDrag();
    expect(position.shouldAnchor(true)).toBe(false);
    position.onScroll(380);
    expect(position.shouldAnchor(true)).toBe(false);
    position.jumpToLatest();
    expect(position.shouldAnchor(true)).toBe(true);
  });
  it("resumes following after scrolling back to the newest message", () => {
    const position = new TranscriptScrollPosition();
    position.beginDrag();
    position.onScroll(300);
    position.endDrag();
    position.beginDrag();
    position.onScroll(0);
    position.endDrag();
    expect(position.shouldAnchor(true)).toBe(true);
  });
});
