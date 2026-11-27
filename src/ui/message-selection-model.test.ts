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
  // The web link leads with its icon's one-em slot, like a file chip.
  expect(source.text).toBe("Use pnpm and read this\n docsold");
  expect(source.runs).toEqual([
    { start: 4, end: 8, mono: true, weight: "500", size: 12 },
    { start: 13, end: 18, weight: "700" },
    { start: 18, end: 22, weight: "700", italic: true },
    { start: 28, end: 31, strike: true },
  ]);
});

it("reserves the icon slot only for links the renderer gives an icon", () => {
  const link = (href: string) => selectionSource([node("link", "", [node("text", "x")], { href })], options)!.text;
  expect(link("bycoda://session/v1/abc")).toBe(" x");
  expect(link("http://localhost:5173")).toBe(" x");
  expect(link("#anchor")).toBe("x");
  expect(link("src/a.ts")).toBe("x");
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

it("mirrors file chips: icon slot, short name in medium weight, location and closing space", () => {
  const codeFile = (text: string) => (text.endsWith(".ts") ? text : null);
  const source = selectionSource(
    [
      node("text", "See "),
      node("link", "", [node("text", "src/a.ts:4")], { href: "src/a.ts:4" }),
      node("text", " and "),
      node("code_inline", "lib/b.ts"),
      node("text", " or "),
      node("code_inline", "pnpm"),
    ],
    { ...options, fileChips: true, codeFile },
  )!;
  expect(source.text).toBe("See \u2003a.ts · L4\u202F and \u2003b.ts\u202F or pnpm");
  const name = source.text.indexOf("a.ts");
  expect(source.runs).toContainEqual({ start: name, end: name + 4, weight: "500" });
  // Without a file owner the link keeps its written label and mentions their @ form.
  expect(selectionSource([node("link", "", [node("text", "src/a.ts")], { href: "src/a.ts" })], options)!.text).toBe("src/a.ts");
  expect(selectionSource([node("text", "open @src/a.ts")], { ...options, mentions: true, fileChips: true })!.text).toBe("open \u2003a.ts\u202F");
});
