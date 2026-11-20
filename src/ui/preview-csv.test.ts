import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CSV_PREVIEW_MAX_ROWS, csvDelimiterFor, csvVisibleColumns, parseCsvPreview } from "./preview-csv";

describe("csvVisibleColumns", () => {
  it("mounts only the columns near the viewport, never all 200", () => {
    const range = csvVisibleColumns(0, 390, 200, 168);
    expect(range.start).toBe(0);
    expect(range.end - range.start).toBeLessThan(10);
  });

  it("follows the scroll offset with overscan on both sides", () => {
    expect(csvVisibleColumns(168 * 50, 336, 200, 168, 2)).toEqual({ start: 48, end: 54 });
  });

  it("clamps at the last column and handles empty or invalid input", () => {
    expect(csvVisibleColumns(168 * 199, 400, 200, 168, 2).end).toBe(200);
    expect(csvVisibleColumns(0, 390, 0, 168)).toEqual({ start: 0, end: 0 });
    expect(csvVisibleColumns(Number.NaN, Number.NaN, 5, 168)).toEqual({ start: 0, end: 2 });
  });
});

describe("CsvTable source", () => {
  const source = readFileSync(new URL("./preview-csv-table.tsx", import.meta.url), "utf8");

  it("virtualizes rows and keeps the table out of a plain row map or sticky ScrollView", () => {
    expect(source).toContain("<FlatList");
    expect(source).toContain("windowSize");
    expect(source).not.toContain("table.rows.map");
    expect(source).not.toContain("stickyHeaderIndices");
    expect(source).toContain("csvVisibleColumns");
  });
});

describe("parseCsvPreview", () => {
  it("splits header and rows and pads ragged lines", () => {
    const result = parseCsvPreview("a,b,c\n1,2\n3,4,5,6\n");
    expect(result.header).toEqual(["a", "b", "c", ""]);
    expect(result.rows).toEqual([["1", "2", "", ""], ["3", "4", "5", "6"]]);
    expect(result.columns).toBe(4);
  });

  it("handles quotes, escaped quotes, embedded newlines, CRLF and BOM", () => {
    const result = parseCsvPreview('\uFEFFname,note\r\n"Ada, L","said ""hi"""\r\n"x","line1\nline2"');
    expect(result.header).toEqual(["name", "note"]);
    expect(result.rows).toEqual([["Ada, L", 'said "hi"'], ["x", "line1\nline2"]]);
  });

  it("stops at the row limit and reports truncation", () => {
    const text = ["h", ...Array.from({ length: 800 }, (_, index) => String(index))].join("\n");
    const result = parseCsvPreview(text);
    expect(result.rows).toHaveLength(CSV_PREVIEW_MAX_ROWS);
    expect(result.truncated).toBe(true);
  });

  it("is not truncated when it fits and skips blank lines", () => {
    const result = parseCsvPreview("a\n\n1\n2");
    expect(result.rows).toEqual([["1"], ["2"]]);
    expect(result.truncated).toBe(false);
  });

  it("uses tabs for tsv", () => {
    expect(csvDelimiterFor("x.tsv")).toBe("\t");
    expect(parseCsvPreview("a\tb\n1\t2", "\t").rows).toEqual([["1", "2"]]);
  });
});
