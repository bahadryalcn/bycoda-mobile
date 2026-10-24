import { describe, expect, it } from "vitest";
import { codePreview, sourceSlice } from "./message-code-model";

describe("code preview", () => {
  it("preserves Unicode at adjacent page and preview boundaries", () => {
    const text = "x".repeat(2399) + "🙂" + " next";
    expect(codePreview(text).text).toBe("x".repeat(2399));
    expect(sourceSlice(text, 0, 2400) + sourceSlice(text, 2400, 4800)).toBe(text);
  });
  it("bounds long lines and many lines without modifying the original", () => {
    const source = "  const value = " + "x".repeat(10_000) + "  \n";
    expect(codePreview(source).text).toHaveLength(2400);
    expect(codePreview(source).truncated).toBe(true);
    expect(source.endsWith("  \n")).toBe(true);
    expect(codePreview(Array.from({ length: 40 }, (_, i) => String(i)).join("\n")).text.split("\n")).toHaveLength(8);
  });
  it("counts source lines without a phantom trailing newline and retains indentation", () => {
    expect(codePreview("  first\n  second\n", 24)).toEqual({ text: "  first\n  second\n", lineCount: 2, truncated: false });
    expect(codePreview("").lineCount).toBe(1);
  });
});
