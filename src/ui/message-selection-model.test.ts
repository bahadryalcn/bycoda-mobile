import { expect, it } from "vitest";
import { isSelectionAction, mentionParts, proseAt, selectionSource, SELECTION_ACTION_IDS } from "./message-selection-model";
import type { MessageNode } from "./message-model";

const node = (type: string, text = "", children: MessageNode[] = [], attrs: Record<string, string> = {}): MessageNode =>
  ({ type, tag: "", text, attrs, children });
const options = { compactMedia: true, mentions: false, codeSize: 12 };

it("mirrors the rendered string and font runs of a paragraph", () => {
  const source = selectionSource([
    node("text", "Use "),
    node("code_inline", "pnpm"),
    node("text", " and "),
    node("strong", "", [node("text", "read "), node("em", "", [node("text", "this")])]),
    node("softbreak"),
    node("link", "", [node("text", "docs")], { href: "https://example.com" }),
    node("s", "", [node("text", "old")]),
  ], options)!;
  expect(source.text).toBe("Use pnpm and read this\ndocsold");
  expect(source.runs).toEqual([
    { start: 4, end: 8, mono: true, weight: "500", size: 12 },
    { start: 13, end: 18, weight: "700" },
    { start: 18, end: 22, weight: "700", italic: true },
    { start: 27, end: 30, strike: true },
  ]);
});

it("merges adjacent runs with the same style", () => {
  const source = selectionSource([node("strong", "", [node("text", "a"), node("text", "b")])], options)!;
  expect(source.runs).toEqual([{ start: 0, end: 2, weight: "700" }]);
});

it("keeps image alt text only where the renderer shows it", () => {
  const nodes = [node("text", "see "), node("image", "fallback", [], { alt: "chart" })];
  expect(selectionSource(nodes, options)!.text).toBe("see ");
  expect(selectionSource(nodes, { ...options, compactMedia: false })!.text).toBe("see chart");
});

it("leaves paragraphs with typeset formulas to the system selection", () => {
  expect(selectionSource([node("text", "x = "), node("math_inline", "x^2")], options)).toBeNull();
});

it("produces the same mention characters as the renderer", () => {
  expect(mentionParts('open @"my file.ts", then @src/a.ts.')).toEqual([
    "open ", { path: "my file.ts", at: 5 }, ", then ", { path: "src/a.ts", at: 25 }, "",
  ]);
  const source = selectionSource([node("text", 'open @"my file.ts", then @src/a.ts.')], { ...options, mentions: true })!;
  expect(source.text).toBe("open @my file.ts, then @src/a.ts");
  expect(selectionSource([node("text", "mail me@x.y")], { ...options, mentions: true })!.text).toBe("mail me@x.y");
});

it("finds the paragraph under a long-press and makes the point local", () => {
  const rects = [
    { id: "a", rect: { x: 10, y: 100, width: 300, height: 40 } },
    { id: "gone", rect: null },
    { id: "b", rect: { x: 10, y: 150, width: 300, height: 60 } },
  ];
  expect(proseAt(rects, 50, 160)).toEqual({ id: "b", x: 40, y: 10 });
  expect(proseAt(rects, 50, 145)).toBeNull();
});

it("accepts only the four app actions from the native menu", () => {
  expect(SELECTION_ACTION_IDS).toEqual(["add", "quote", "translate", "copy"]);
  expect(isSelectionAction("quote")).toBe(true);
  expect(isSelectionAction("share")).toBe(false);
});
