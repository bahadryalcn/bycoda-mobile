import { describe, expect, it } from "vitest";
import { continueMarkdownList, markdownEdit, markdownSpans, type MarkdownTone } from "./markdown-editing";

const joined = (text: string) => markdownSpans(text).map((span) => span.text).join("");
const tonesOf = (text: string, part: string): readonly MarkdownTone[] | undefined =>
  markdownSpans(text).find((span) => span.text === part)?.tones;

describe("markdownSpans", () => {
  it("returns exactly the source text, so styling never changes what is saved", () => {
    const samples = [
      "",
      "plain",
      "# Title\n\nSome **bold** and *it* and ~~gone~~ with `code`.",
      "- [x] done\n- [ ] open\n1. one\n> quote **b**\n---\n```ts\nconst a = `x`;\n```\nafter",
      "unclosed **bold and *italic\n\n\n[link](https://example.com) https://bycoda.dev/a_b.",
      "👩🏽‍💻 İstanbul **çok** güzel\r\nwindows line",
      "~~~\n# not a heading\n~~~",
    ];
    for (const sample of samples) expect(joined(sample)).toBe(sample);
  });

  it("styles headings, emphasis, code, links, quotes and checked items", () => {
    expect(tonesOf("# Title", "# ")).toEqual(["h1", "marker"]);
    expect(tonesOf("# Title", "Title")).toEqual(["h1"]);
    expect(tonesOf("### Deep", "Deep")).toEqual(["h3"]);
    expect(tonesOf("a **b** c", "b")).toEqual(["strong"]);
    expect(tonesOf("a **b *c* d** e", "c")).toEqual(["strong", "em"]);
    expect(tonesOf("a `x*y*` c", "x*y*")).toEqual(["code"]);
    expect(tonesOf("see [docs](https://a.dev)", "docs")).toEqual(["link"]);
    expect(tonesOf("> said", "said")).toEqual(["quote"]);
    expect(tonesOf("- [x] shipped", "shipped")).toEqual(["done"]);
    expect(tonesOf("- [ ] open", "open")).toEqual([]);
    expect(tonesOf("---", "---")).toEqual(["rule"]);
  });

  it("keeps fenced code literal", () => {
    const text = "```\n# **not styled**\n```";
    expect(tonesOf(text, "# **not styled**")).toEqual(["fence"]);
  });
});

describe("continueMarkdownList", () => {
  const enter = (before: string, after: string) => continueMarkdownList(before + after, `${before}\n${after}`);

  it("continues bullets, numbers and checklists", () => {
    expect(enter("- one", "")).toEqual({ text: "- one\n- ", caret: 8 });
    expect(enter("  2. two", "")).toEqual({ text: "  2. two\n  3. ", caret: 14 });
    expect(enter("- [x] done", "")?.text).toBe("- [x] done\n- [ ] ");
  });

  it("ends the list on an empty item", () => {
    expect(enter("- one\n- ", "")).toEqual({ text: "- one\n", caret: 6 });
  });

  it("moves the rest of a split item into the next one", () => {
    expect(enter("- ab", "cd")).toEqual({ text: "- ab\n- cd", caret: 7 });
  });

  it("ignores ordinary lines, fenced code and edits other than one line break", () => {
    expect(enter("plain", "")).toBeNull();
    expect(enter("```\n- code", "")).toBeNull();
    expect(continueMarkdownList("- a", "- ab")).toBeNull();
  });
});

describe("desktop toolbar transforms", () => {
  it("are the desktop note editor's edits", () => {
    expect(markdownEdit("bold", "word", 0, 4)).toMatchObject({ insert: "**word**" });
    expect(markdownEdit("checklist", "task", 0, 0)).toMatchObject({ insert: "- [ ] task" });
  });
});
