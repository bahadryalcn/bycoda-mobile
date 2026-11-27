import { describe, expect, it } from "vitest";
import { fenceComplete, fenceLanguage, parseMessage, type MessageNode } from "./message-model";
import { scopedMessageReferences } from "./message-citations";
import { codeDisclosure, codeDisplayText, codePreview } from "./message-code-model";
import { messageTableData, messageTableMarkdown, tableMarkdown, tableTextAlign } from "./message-table-model";

const flatten = (nodes: MessageNode[]): MessageNode[] => nodes.flatMap((node) => [node, ...flatten(node.children)]);
const fence = (text: string) => flatten(parseMessage(text)).find((node) => node.type === "fence")!;
const table = (text: string) => flatten(parseMessage(text)).find((node) => node.type === "table")!;

describe("fenced code completeness", () => {
  it("treats a closed fence inside a blockquote as complete, not as still arriving", () => {
    expect(fence("> ```js\n> const a = 1;\n> ```\n\nafter").complete).toBe(true);
    expect(fence("> > ~~~\n> > x\n> > ~~~").complete).toBe(true);
  });

  it("keeps closed fences in lists, tilde fences and longer closers complete", () => {
    expect(fence("1. step\n\n   ```sh\n   run\n   ```\n2. next").complete).toBe(true);
    expect(fence("~~~python\nx\n~~~").complete).toBe(true);
    expect(fence("```\nx\n`````").complete).toBe(true);
  });

  it("marks only a fence that runs to the end of the source as still arriving", () => {
    expect(fence("```js\nconst a = 1;").complete).toBe(false);
    expect(fence("~~~\nx").complete).toBe(false);
    // A partial closer while streaming is not a closer yet.
    expect(fence("```js\nx\n``").complete).toBe(false);
    // A closer of the other fence character does not close it.
    expect(fence("```\nx\n~~~").complete).toBe(false);
    expect(fence("> ```js\n> a").complete).toBe(false);
  });

  it("settles a fence its container ended once later text follows", () => {
    expect(fence("- ```\n  a\n- b").complete).toBe(true);
    expect(fence("> ```js\n> a\n\nafter").complete).toBe(true);
  });

  it("checks closing markers by character and length", () => {
    expect(fenceComplete(["````", "x", "```"], [0, 3], "````")).toBe(false);
    expect(fenceComplete(["````", "x", "````  "], [0, 3], "````")).toBe(true);
    expect(fenceComplete(["```"], [0, 1], "```")).toBe(false);
  });

  it("reads Pandoc-style languages and keeps unknown ones as written", () => {
    expect(fenceLanguage("{.python}")).toBe("python");
    expect(fenceLanguage("{ts}")).toBe("ts");
    expect(fenceLanguage("foo-bar title=x")).toBe("foo-bar");
    expect(fence("```foo-bar\nx\n```").attrs.language).toBe("foo-bar");
    expect(fence("```\nx\n```").attrs.language).toBe("");
  });
});

describe("code block display", () => {
  const lines = (count: number) => Array.from({ length: count }, (_, i) => `line ${i}`).join("\n");

  it("drops the fence's final newline so no empty last row renders, keeping inner blank lines", () => {
    expect(codeDisplayText("a\n\nb\n")).toBe("a\n\nb");
    expect(codeDisplayText("a\r\n")).toBe("a");
    expect(codeDisplayText("a")).toBe("a");
    expect(codeDisplayText("a\n\n")).toBe("a\n");
  });

  it("does not count the final newline as hidden content", () => {
    expect(codePreview(`${lines(10)}\n`, 10).truncated).toBe(false);
    expect(codeDisclosure(`${lines(10)}\n`).mode).toBe("whole");
    expect(codeDisclosure(`${lines(11)}\n`)).toMatchObject({ mode: "inline", lineCount: 11, hiddenLines: 3 });
  });
});

describe("table model", () => {
  it("gives unmarked columns natural (RTL-safe) alignment and copies explicit left as :---", () => {
    const data = messageTableData(table("| A | B | C | D |\n| --- | :-- | :-: | --: |\n| 1 | 2 | 3 | 4 |"));
    expect(data.align).toEqual(["start", "left", "center", "right"]);
    expect(data.align.map(tableTextAlign)).toEqual([undefined, "left", "center", "right"]);
    expect(messageTableMarkdown(data).split("\n")[1]).toBe("| --- | :--- | :---: | ---: |");
  });

  it("returns the same data for the same parsed table, so memoized widths and Markdown survive renders", () => {
    const node = table("| A |\n| --- |\n| 1 |");
    expect(messageTableData(node)).toBe(messageTableData(node));
  });

  it("escapes every pipe of a run and keeps escaped pipes and unescaped cell text intact", () => {
    expect(tableMarkdown(["a||b"], [])).toBe("| a\\|\\|b |\n| --- |");
    expect(tableMarkdown(["a \\| b"], [])).toBe("| a \\| b |\n| --- |");
    // markdown-it unescapes `\|` in cell source; copying escapes it again so the cell stays one cell.
    const data = messageTableData(table("| a \\| b | c |\n| --- | --- |\n| `p\\|q` | 2 |"));
    expect(data.columns).toBe(2);
    expect(messageTableMarkdown(data)).toBe("| a \\| b | c |\n| --- | --- |\n| `p\\|q` | 2 |");
  });

  it("pads ragged rows to the header's columns and copies huge tables without overflowing the stack", () => {
    const ragged = messageTableData(table("| A | B | C |\n| --- | --- | --- |\n| 1 |\n| 1 | 2 | 3 | 4 |"));
    expect(ragged.columns).toBe(3);
    expect(ragged.rows.map((row) => row.length)).toEqual([3, 3]);
    const rows = Array.from({ length: 200_000 }, (_, index) => [String(index)]);
    expect(() => tableMarkdown(["n"], rows)).not.toThrow();
  });
});

describe("scoped references keep node identity", () => {
  it("returns the same nodes when no citation marker is present", () => {
    const nodes = parseMessage("# Title\n\n- **one** [a](src/a.ts)\n\n| A |\n| --- |\n| 1 |");
    const scoped = scopedMessageReferences(nodes, { cwd: "/repo" });
    expect(scoped).toBe(nodes);
  });

  it("copies only the branch that holds a marker", () => {
    const nodes = parseMessage('Intro\n\nSee :codex-file-citation{path="/repo/a.pdf"} now');
    const scoped = scopedMessageReferences(nodes, { cwd: "/repo" });
    expect(scoped).not.toBe(nodes);
    expect(scoped[0]).toBe(nodes[0]);
    expect(scoped[1]).not.toBe(nodes[1]);
  });
});
