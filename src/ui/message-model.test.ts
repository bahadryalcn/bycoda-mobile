import { describe, expect, it } from "vitest";
import { parseMessage, messageNodeText, type MessageNode } from "./message-model";
import { highlightCode } from "./message-highlight";
const flatten = (nodes: MessageNode[]): MessageNode[] => nodes.flatMap((node) => [node, ...flatten(node.children)]);
describe("native rich message model", () => {
  it("retains nested lists, task markers, tables, emphasis and image/link targets", () => {
    const nodes = flatten(parseMessage("## Result\n\n- [x] Done\n  - **nested** and *emphasis*\n\n| Name | Value |\n| --- | --- |\n| one | `2` |\n\n![preview](assets/result.png) [file](src/app.ts:4)"));
    for (const type of ["heading", "bullet_list", "list_item", "strong", "em", "table", "th", "td", "code_inline", "image", "link"]) expect(nodes.some((node) => node.type === type), type).toBe(true);
    expect(nodes.find((node) => node.type === "image")?.attrs.src).toBe("assets/result.png");
    expect(nodes.find((node) => node.type === "heading")?.tag).toBe("h2");
  });
  it("does not execute raw HTML and distinguishes completed streaming fences", () => {
    const pending = flatten(parseMessage("```html\n<button>go</button>"));
    expect(pending.find((node) => node.type === "fence")?.complete).toBe(false);
    expect(flatten(parseMessage("```html\n<button>go</button>\n```" )).find((node) => node.type === "fence")?.complete).toBe(true);
    const raw = parseMessage("<script>alert(1)</script>");
    expect(flatten(raw).some((node) => node.type.startsWith("html"))).toBe(false);
    expect(raw.map(messageNodeText).join("")).toContain("<script>");
  });
  it("keeps highlighted source byte-for-byte intact and limits pathological input", () => {
    const source = 'const x = "hello"; // note\nreturn x + 12;';
    expect(highlightCode(source, "ts").map((token) => token.text).join("")).toBe(source);
    expect(highlightCode(source, "unknown")).toEqual([{ text: source, kind: "plain" }]);
    expect(parseMessage("x".repeat(300_000)).map(messageNodeText).join("").length).toBe(256_000);
  });
});
