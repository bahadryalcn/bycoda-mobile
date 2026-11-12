import { describe, expect, it } from "vitest";
import { composerLinks, formatAttachmentSize, thumbnailSplit } from "./attachment-presentation";

describe("attachment presentation", () => {
  it("formats sizes", () => {
    expect(formatAttachmentSize(512, "en")).toBe("512 B");
    expect(formatAttachmentSize(1536, "en")).toBe("1.5 KB");
    expect(formatAttachmentSize(20 * 1024, "en")).toBe("20 KB");
    expect(formatAttachmentSize(-1)).toBe("");
  });
  it("finds distinct web links and trims punctuation", () => {
    const links = composerLinks("see https://www.example.com/a?b=1, and https://example.com/a?b=1). also http://x.dev/ and ftp://no");
    expect(links.map((l) => l.host)).toEqual(["example.com", "example.com", "x.dev"].slice(0, links.length));
    expect(links[0]).toMatchObject({ host: "example.com", path: "/a?b=1" });
    expect(links.some((l) => l.href.startsWith("ftp"))).toBe(false);
  });
  it("collapses extra images behind a count", () => {
    const images = [1, 2, 3, 4, 5, 6];
    expect(thumbnailSplit(images, false)).toEqual({ shown: [1, 2, 3], hidden: 3 });
    expect(thumbnailSplit(images, true).hidden).toBe(0);
    expect(thumbnailSplit([1, 2, 3, 4], false).hidden).toBe(0);
  });
});
