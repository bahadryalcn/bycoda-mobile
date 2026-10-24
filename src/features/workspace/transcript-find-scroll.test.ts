import { describe, expect, it } from "vitest";
import { TranscriptFindScroll } from "./transcript-find-scroll";

describe("virtualized find scroll recovery", () => {
  it("resolves the current index by entry identity when paging or streaming shifts rows", () => {
    const scroll = new TranscriptFindScroll();
    scroll.select("old");
    expect(scroll.retry([{ id: "new" }, { id: "old" }])).toBe(1);
    expect(scroll.retry([{ id: "newer" }, { id: "new" }, { id: "old" }])).toBe(2);
  });
  it("stops after bounded attempts and clears missing or superseded targets", () => {
    const scroll = new TranscriptFindScroll();
    scroll.select("a");
    for (let i = 0; i < 4; i++) expect(scroll.retry([{ id: "a" }])).toBe(0);
    expect(scroll.retry([{ id: "a" }])).toBeUndefined();
    scroll.select("a");
    expect(scroll.retry([{ id: "b" }])).toBeUndefined();
    expect(scroll.retry([{ id: "a" }])).toBeUndefined();
    scroll.select("b");
    scroll.cancel();
    expect(scroll.retry([{ id: "b" }])).toBeUndefined();
  });
});
