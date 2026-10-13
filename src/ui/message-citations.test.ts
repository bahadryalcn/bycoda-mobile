import { describe, expect, it } from "vitest";
import { parseMessage, type MessageNode } from "./message-model";
import { scopedMessageReferences } from "./message-citations";
const flatten = (nodes: MessageNode[]): MessageNode[] =>
  nodes.flatMap((node) => [node, ...flatten(node.children)]);
const links = (text: string, cwd = "/repo", basePath?: string) =>
  flatten(scopedMessageReferences(parseMessage(text), { cwd, basePath })).filter(
    (node) => node.type === "link",
  );

describe("scoped output citations", () => {
  it("renders the desktop PDF citation and visualize HTML marker forms", () => {
    const directory = "/Users/me/projects/shop/.artifacts/reports/assessment-pdf";
    const text = `:codex-file-citation{path="${directory}/prs-tr.pdf" purpose="output"}\n\n:codex-file-citation{path="${directory}/ancestry-tr.pdf" purpose="output"}`;
    expect(links(text, "/Users/me/projects/shop").map((node) => node.children[0]?.text)).toEqual([
      "prs-tr.pdf",
      "ancestry-tr.pdf",
    ]);
    const preview = 'Önizleme: \uE200visualize\uE202{"path":"/repo/preview.html"}\uE201 hazır.';
    expect(links(preview).map((node) => node.attrs.href)).toEqual(["/repo/preview.html"]);
    const nodes = flatten(scopedMessageReferences(parseMessage(preview), { cwd: "/repo" }));
    expect(
      nodes
        .filter((node) => node.type === "text")
        .map((node) => node.text)
        .join(""),
    ).toBe("Önizleme: preview.html hazır.");
  });
  it("preserves spaces, Unicode and Windows separators while checking the root", () => {
    expect(
      links(
        "Rapor: :codex-file-citation{purpose='output' path='/Users/me/My Project/özet.pdf'} hazır.",
        "/Users/me/My Project",
      )[0]?.attrs.href,
    ).toBe("/Users/me/My Project/özet.pdf");
    for (const path of ["C:\\temp\\reports\\özet.pdf", "G:\\My Projects\\ayşe\\özet.pdf"]) {
      const cwd = path.slice(0, path.lastIndexOf("\\"));
      expect(
        links(`:codex-file-citation{path="${path}" purpose="output"}`, cwd)[0]?.attrs.href,
      ).toBe(path);
    }
    expect(
      links(':codex-file-citation{path="../report.md"}', "/repo", "docs/guide.md")[0]?.attrs.href,
    ).toBe("../report.md");
  });
  it.each([
    ':codex-file-citation{path="/repo/report.pdf"',
    ':codex-file-citation{purpose="output"}',
    ':codex-file-citation{path="//host/share/report.pdf" purpose="output"}',
    ':codex-file-citation{path="/outside/report.pdf"}',
    ':codex-file-citation{path="%2e%2e/secret.pdf"}',
    '\uE200visualize\uE202{"path":"/repo/page.html"}',
    '\uE200visualize\uE202{"path":"/repo/page.js"}\uE201',
    "\uE200visualize\uE202{broken}\uE201",
    '`\uE200visualize\uE202{"path":"/repo/page.html"}\uE201`',
    '```text\n:codex-file-citation{path="/repo/report.pdf" purpose="output"}\n```',
  ])("keeps incomplete, unsafe and example markers inert: %s", (text) => {
    expect(links(text)).toEqual([]);
  });
  it("never converts untrusted web markers to project actions or mutates shared cached nodes", () => {
    const text = ':codex-file-citation{path="/repo/secret.md"}';
    const nodes = parseMessage(text);
    const before = JSON.stringify(nodes);
    expect(scopedMessageReferences(nodes)).toBe(nodes);
    expect(links(text, "/other")).toEqual([]);
    expect(links(text)).toHaveLength(1);
    expect(JSON.stringify(nodes)).toBe(before);
    for (const text of [
      ':codex-file-citation{path="https://example.com/report.pdf"}',
      '\uE200visualize\uE202{"path":"https://example.com/page.html"}\uE201',
    ]) {
      expect(links(text).filter((node) => !node.attrs.href?.startsWith("https:"))).toEqual([]);
    }
  });
});
