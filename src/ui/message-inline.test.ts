import { describe, expect, it } from "vitest";
import { markdownTarget, messageInlineParts } from "./message-inline";

describe("native transcript link safety", () => {
  it("shows Windows host paths as inert file context rather than raw Markdown", () => {
    expect(messageInlineParts("Read [README](G:/Projects/bycoda/README.md:12). ")).toEqual([
      { kind: "text", text: "Read " },
      {
        kind: "link",
        text: "README",
        target: { kind: "file", context: "G:/Projects/bycoda/README.md:12" },
      },
      { kind: "text", text: ". " },
    ]);
  });

  it("retains spaces, balanced folder parentheses and UNC paths without opening them", () => {
    expect(messageInlineParts("[note](G:/Projects/(mobile)/My note.md)")[0]).toMatchObject({
      kind: "link",
      text: "note",
      target: { kind: "file", context: "G:/Projects/(mobile)/My note.md" },
    });
    expect(markdownTarget("\\\\desktop\\project\\README.md").kind).toBe("file");
    expect(markdownTarget("<G:/Projects/(mobile)/My note.md>")).toEqual({
      kind: "file",
      context: "G:/Projects/(mobile)/My note.md",
    });
  });

  it("removes HTTP credentials from destinations, hints and URL-shaped labels", () => {
    expect(markdownTarget("https://owner:secret@example.com/docs?a=1")).toEqual({
      kind: "web",
      href: "https://example.com/docs?a=1",
      context: "https://example.com/docs?a=1",
    });
    expect(
      messageInlineParts("[https://owner:secret@example.com](https://owner:secret@example.com)")[0],
    ).toEqual({
      kind: "link",
      text: "https://example.com/",
      target: { kind: "web", href: "https://example.com/", context: "https://example.com/" },
    });
  });

  it("never makes file, JavaScript, data or custom scheme links actionable", () => {
    for (const target of [
      "javascript:alert(1)",
      "data:text/html,test",
      "bycoda://send",
      "intent://anything",
      "https://example.com\n/path",
    ]) {
      expect(markdownTarget(target)).toEqual({ kind: "unavailable" });
    }
    expect(markdownTarget("file:///G:/project/README.md")).toEqual({
      kind: "file",
      context: "file:///G:/project/README.md",
    });
  });

  it("preserves literal Markdown inside code and incomplete streamed links", () => {
    expect(messageInlineParts("`[README](G:/project/README.md)`")).toEqual([
      { kind: "code", text: "[README](G:/project/README.md)" },
    ]);
    expect(messageInlineParts("Read [README](G:/project/README.md")).toEqual([
      { kind: "text", text: "Read [README](G:/project/README.md" },
    ]);
  });

  it("recognizes filename-only source locations without allowing arbitrary schemes", () => {
    for (const path of ["example.ts:1", "example.ts:42:8", "readme.md:3"]) {
      expect(markdownTarget(path)).toEqual({ kind: "file", context: path });
    }
    for (const target of ["mailto:owner@example.com", "example.ts:run", "javascript:1"]) {
      expect(markdownTarget(target)).toEqual({ kind: "unavailable" });
    }
  });

  it("keeps safe web links with balanced URL parentheses", () => {
    expect(messageInlineParts("[Docs](https://example.com/docs_(mobile))")[0]).toMatchObject({
      kind: "link",
      text: "Docs",
      target: { kind: "web", href: "https://example.com/docs_(mobile)" },
    });
  });
});
