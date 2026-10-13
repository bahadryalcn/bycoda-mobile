import { describe, expect, it } from "vitest";
import { TranscriptScrollPosition } from "./transcript-scroll";

describe("transcript scroll ownership", () => {
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
