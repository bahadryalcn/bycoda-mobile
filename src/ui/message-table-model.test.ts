import { describe, expect, it } from "vitest";
import { parseMessage, type MessageNode } from "./message-model";
import { messageTableColumnWidths, tableColumnWidths } from "./message-table-model";

const flatten = (nodes: MessageNode[]): MessageNode[] => nodes.flatMap((node) => [node, ...flatten(node.children)]);

it("uses the ARIA table role instead of the legacy native role that crashes on Android", () => {
  const renderer = readFileSync(new URL("./message-content.tsx", import.meta.url), "utf8");
  expect(renderer).not.toContain('accessibilityRole="table"');
  expect(renderer).toContain('role="table"');
});

describe("markdown table column sizing", () => {
  it("sizes each column to its longest cell instead of a fixed width", () => {
    const [short, long] = tableColumnWidths([[2, 40], [3, 6]], 15, 1);
    expect(short).toBeLessThan(long!);
    expect(short).toBe(6 * 15);
  });

  it("caps long content at the maximum so it wraps rather than widening the table", () => {
    const [wide] = tableColumnWidths([[500]], 15, 1);
    expect(wide).toBe(16 * 15);
  });

  it("grows every width with the system font scale", () => {
    const normal = tableColumnWidths([[20, 4]], 15, 1);
    const large = tableColumnWidths([[20, 4]], 15, 2);
    expect(large[0]).toBeCloseTo(normal[0]! * 2);
    expect(large[1]).toBeCloseTo(normal[1]! * 2);
  });

  it("follows the chat text size, not only the font scale", () => {
    expect(tableColumnWidths([[20]], 20, 1)[0]).toBeGreaterThan(tableColumnWidths([[20]], 15, 1)[0]!);
  });

  it("falls back to a neutral scale for invalid font metrics", () => {
    expect(tableColumnWidths([[20]], Number.NaN, 0)).toEqual(tableColumnWidths([[20]], 15, 1));
  });

  it("returns one width per column across ragged rows and no columns for empty input", () => {
    expect(tableColumnWidths([[1, 1, 1], [1]], 15, 1)).toHaveLength(3);
    expect(tableColumnWidths([], 15, 1)).toEqual([]);
  });

  it("measures the plain text of parsed Markdown cells, including emphasis and code", () => {
    const text = "| Name | Notes |\n| --- | --- |\n| **a** | `x` |";
    const table = flatten(parseMessage(text, true)).find((node) => node.type === "table");
    expect(table).toBeDefined();
    const rows = table!.children.flatMap((section) => section.children);
    const widths = messageTableColumnWidths(rows, 15, 1);
    expect(widths).toHaveLength(2);
    expect(widths.every((width) => width >= 6 * 15 && width <= 16 * 15)).toBe(true);
  });
});
import { readFileSync } from "node:fs";
