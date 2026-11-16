import { describe, expect, it } from "vitest";
import { parseMessage, type MessageNode } from "./message-model";
import { linkOnlyItem, sourceList } from "./message-link-item";

const firstItem = (markdown: string): MessageNode => {
  const list = parseMessage(markdown, true).find((node) => node.type === "bullet_list")!;
  return list.children[0]!;
};

describe("linkOnlyItem", () => {
  it("detects an item made of a single web link", () => {
    expect(linkOnlyItem(firstItem("- [Chromium issue](https://www.example.com/a?b=1)"))).toEqual({
      href: "https://www.example.com/a?b=1",
      title: "Chromium issue",
      host: "example.com",
    });
  });
  it("ignores items that mix text and a link", () => {
    expect(linkOnlyItem(firstItem("- See [docs](https://example.com) for more"))).toBeNull();
  });
  it("ignores items with several links", () => {
    expect(linkOnlyItem(firstItem("- [a](https://a.example) [b](https://b.example)"))).toBeNull();
  });
  it("ignores file links and plain text", () => {
    expect(linkOnlyItem(firstItem("- [file](src/app.ts)"))).toBeNull();
    expect(linkOnlyItem(firstItem("- plain"))).toBeNull();
  });
  it("ignores items with nested content", () => {
    expect(linkOnlyItem(firstItem("- [a](https://a.example)\n  - child"))).toBeNull();
  });
});

describe("sourceList", () => {
  const items = (markdown: string) =>
    parseMessage(markdown, true).find((node) => node.type === "bullet_list")!.children;
  it("collects a list made only of two or more web links", () => {
    expect(sourceList(items("- [A](https://a.example)\n- [B](https://www.b.example/x)"))).toEqual([
      { href: "https://a.example/", title: "A", host: "a.example" },
      { href: "https://www.b.example/x", title: "B", host: "b.example" },
    ]);
  });
  it("keeps a single link or a mixed list as ordinary rows", () => {
    expect(sourceList(items("- [A](https://a.example)"))).toBeNull();
    expect(sourceList(items("- [A](https://a.example)\n- plain"))).toBeNull();
  });
});
