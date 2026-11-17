import { describe, expect, it } from "vitest";
import { CSV_PREVIEW_MAX_ROWS, csvDelimiterFor, parseCsvPreview } from "./preview-csv";

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
