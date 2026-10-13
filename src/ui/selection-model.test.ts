import { describe, expect, it } from "vitest";
import { filterSelection, toggleSelection } from "./selection-model";

describe("searchable selection", () => {
  it("searches labels and paths, preserving duplicate display names", () => {
    const options = [
      { value: "a", label: "monocode", detail: "G:/Projects/a" },
      { value: "b", label: "monocode", detail: "G:/Projects/b" },
    ];
    expect(filterSelection(options, "MONOCODE")).toHaveLength(2);
    expect(filterSelection(options, " /b ").map((option) => option.value)).toEqual(["b"]);
  });
  it("allows removal at the limit and preserves every existing choice", () => {
    const selected = ["a", "b"];
    expect(toggleSelection(selected, "c", 2)).toEqual(selected);
    expect(toggleSelection(selected, "a", 2)).toEqual(["b"]);
    expect(toggleSelection(["b"], "c", 2)).toEqual(["b", "c"]);
    expect(selected).toEqual(["a", "b"]);
  });
});
