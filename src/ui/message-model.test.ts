import { describe, expect, it } from "vitest";
import { parseMessage, messageDisplaySource, messageNodeText, type MessageNode } from "./message-model";
import { highlightCode } from "./message-highlight";
const flatten = (nodes: MessageNode[]): MessageNode[] => nodes.flatMap((node) => [node, ...flatten(node.children)]);
describe("native rich message model", () => {
  it("renders scoped file links with spaces and balanced parentheses without changing literal examples", () => {
    const source = "Read [Change summary](G:/Projects/(mobile)/My notes/README.md:12).";
    expect(flatten(parseMessage(source)).find((node) => node.type === "link")?.attrs.href)
      .toBe("G:/Projects/(mobile)/My notes/README.md:12");
    for (const literal of [`\`${source}\``, `\`\`\`md\n${source}\n\`\`\``, String.raw`\[Change summary](G:/My notes/README.md)`]) {
      expect(flatten(parseMessage(literal)).some((node) => node.type === "link")).toBe(false);
    }
    expect(flatten(parseMessage("[unsafe](javascript:alert(1))")).some((node) => node.type === "link")).toBe(false);
  });
  const memoryCitation = "<oai-mem-citation>\n<citation_entries>\nMEMORY.md:1-2|note=[context]\n</citation_entries>\n<rollout_ids>\nexample-id\n</rollout_ids>\n</oai-mem-citation>";
  it("omits complete internal memory metadata from presentation while preserving surrounding Markdown", () => {
    const source = `**Done**\n\n${memoryCitation}\n\nNext step`;
    const nodes = flatten(parseMessage(source, true));
    expect(nodes.some((node) => node.type === "strong")).toBe(true);
    expect(parseMessage(source, true).map(messageNodeText).join("\n")).toBe("**Done**\nNext step");
    expect(parseMessage(source).map(messageNodeText).join("\n")).toContain(memoryCitation);
    expect(messageDisplaySource(source)).toBe("**Done**\n\n\nNext step");
    expect(source).toContain(memoryCitation);
  });
  it("preserves metadata literals in code and unrelated or incomplete XML", () => {
    for (const fence of ["```xml", "~~~xml"]) {
      const source = `${fence}\n${memoryCitation}\n${fence.slice(0, 3)}`;
      expect(flatten(parseMessage(source, true)).find((node) => node.type === "fence")?.text).toBe(`${memoryCitation}\n`);
      expect(messageDisplaySource(source)).toBe(source);
    }
    const indented = memoryCitation.split("\n").map((line) => `    ${line}`).join("\n");
    expect(flatten(parseMessage(indented, true)).find((node) => node.type === "code_block")?.text).toBe(`${memoryCitation}\n`);
    expect(messageDisplaySource(indented)).toBe(indented);
    for (const source of ["`<oai-mem-citation>`", "<custom>ordinary XML</custom>", "<oai-mem-citation>\nnot metadata\n</oai-mem-citation>", memoryCitation.replace("</oai-mem-citation>", "")]) {
      expect(parseMessage(source, true).map(messageNodeText).join("\n")).toContain(source.trimEnd());
      expect(messageDisplaySource(source)).toBe(source);
    }
  });
  it("keeps long-reader surrounding source intact and does not suppress quoted examples", () => {
    const before = "x".repeat(260_000) + "\r\n\r\n";
    const source = before + memoryCitation.replaceAll("\n", "\r\n") + "\r\n\r\nAfter";
    expect(messageDisplaySource(source) === before + "\r\nAfter").toBe(true);
    const quote = memoryCitation.split("\n").map((line) => `> ${line}`).join("\n");
    expect(messageDisplaySource(quote)).toBe(quote);
  });
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
