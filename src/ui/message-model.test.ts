import { describe, expect, it } from "vitest";
import { messageCacheKey, messageDigest, parseMessage, messageDisplaySource, messageNodeText, type MessageNode } from "./message-model";
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
  it("limits pathological input", () => {
    expect(parseMessage("x".repeat(300_000)).map(messageNodeText).join("").length).toBe(256_000);
  });
});

describe("markdown parse cache", () => {
  it("keys by block id and content digest, not by the full text", () => {
    expect(messageCacheKey(true, "block-1")).toBe(messageCacheKey(true, "block-1", "any text"));
    expect(messageCacheKey(true, "block-1")).not.toBe(messageCacheKey(false, "block-1"));
    expect(messageCacheKey(true, "block-1")).not.toBe(messageCacheKey(true, "block-2"));
    expect(messageDigest("abc")).toBe(messageDigest("abc"));
    expect(messageDigest("abc")).not.toBe(messageDigest("abd"));
    expect(messageDigest("abc")).not.toBe(messageDigest("abcd"));
  });
  it("reuses a parse for unchanged text and reparses when the digest changes", () => {
    const first = parseMessage("hello **world**", true, "cache-a");
    expect(parseMessage("hello **world**", true, "cache-a")).toBe(first);
    const next = parseMessage("hello **world** again", true, "cache-a");
    expect(next).not.toBe(first);
    expect(parseMessage("hello **world** again", true, "cache-a")).toBe(next);
  });
  it("lets one streaming message churn without evicting the others", () => {
    const others = Array.from({ length: 40 }, (_, i) => parseMessage(`message ${i}`, true, `other-${i}`));
    let text = "";
    for (let i = 0; i < 600; i++) {
      text += "token ";
      parseMessage(text, true, "streaming");
    }
    others.forEach((nodes, i) => expect(parseMessage(`message ${i}`, true, `other-${i}`)).toBe(nodes));
  });
});

describe("streaming parse", () => {
  const documents = [
    "# Title\n\nFirst paragraph with **bold** and `code`.\n\n- one\n- two\n\n  continued item\n- three\n\nAfter the list.\n\n1. a\n2. b\n\n```ts\nconst x = 1;\n\nconst y = 2;\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nTail text\nwith a soft break.\n\n> quote\n\n> second quote\n\nPara\n---\n\nDone.",
    "Intro\n\n$$\nx = 1\n\ny = 2\n$$\n\nMore text\n\n\[\na\n\]\n\nEnd",
    "See [docs][ref] here.\n\nSecond.\n\n[ref]: https://example.com\n\nThird.",
    "Text\n\n    indented code\n\n    more code\n\nBack\n\n~~~~\n```\n\nnot closed\n```\n~~~~\n\nLast",
    "Answer\n\n<oai-mem-citation>\n<citation_entries>\nx\n</citation_entries>\n<rollout_ids>\ny\n</rollout_ids>\n</oai-mem-citation>\n\nAfter",
    "header\n| a | b |\n|---|---|\n| 1 | 2 |\n\nfoo\n\n- a\n\n  ```\n  x\n\nbar\n```\n\nbaz\n\n```\nqux\n\nquux",
  ];
  const plain = (nodes: MessageNode[]) => JSON.stringify(nodes);
  it.each(documents.map((text, index) => [index, text] as const))("matches a full parse at every prefix (%i)", (index, text) => {
    for (let end = 1; end <= text.length; end++) {
      const prefix = text.slice(0, end);
      expect(plain(parseMessage(prefix, true, `stream-${index}`))).toBe(plain(parseMessage(prefix, true)));
    }
    for (let end = 3; end <= text.length + 6; end += 7) {
      const prefix = text.slice(0, end);
      expect(plain(parseMessage(prefix, false, `chunk-${index}`))).toBe(plain(parseMessage(prefix, false)));
    }
  });
  it("keeps settled blocks' identity while the tail grows", () => {
    const first = parseMessage("One.\n\nTwo.\n\nThree", true, "stream-identity");
    const next = parseMessage("One.\n\nTwo.\n\nThree and more", true, "stream-identity");
    expect(next[0]).toBe(first[0]);
    expect(next).toHaveLength(3);
  });
});
