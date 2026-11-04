import { describe, expect, it } from "vitest";
import { filterSelection, selectionLabels, toggleSelection } from "./selection-model";

describe("searchable selection", () => {
  it("shows a placeholder for an unselected empty value but retains named defaults and missing saved choices", () => {
    expect(selectionLabels([""], new Map([["ours", "Our version"]]))).toEqual([]);
    expect(selectionLabels([""], new Map([["", "System default"]]))).toEqual(["System default"]);
    expect(selectionLabels(["removed-shell"], new Map())).toEqual(["removed-shell"]);
  });
  it("searches labels and paths, preserving duplicate display names", () => {
    const options = [
      { value: "a", label: "monocode", detail: "G:/Projects/a" },
      { value: "b", label: "monocode", detail: "G:/Projects/b" },
    ];
    expect(filterSelection(options, "MONOCODE")).toHaveLength(2);
    expect(filterSelection(options, " /b ").map((option) => option.value)).toEqual(["b"]);
  });
  it("uses the requested locale and normalizes whitespace without losing duplicate identities", () => {
    const options = [{ value: "a", label: "İLETİŞİM", detail: "first   path" }, { value: "b", label: "İLETİŞİM", detail: "second path" }];
    expect(filterSelection(options, "iletişim", "tr").map(option => option.value)).toEqual(["a", "b"]);
    expect(filterSelection(options, "iletişim", "en")).toEqual([]);
    expect(filterSelection(options, "first  path", "tr").map(option => option.value)).toEqual(["a"]);
  });
  it("allows removal at the limit and preserves every existing choice", () => {
    const selected = ["a", "b"];
    expect(toggleSelection(selected, "c", 2)).toEqual(selected);
    expect(toggleSelection(selected, "a", 2)).toEqual(["b"]);
    expect(toggleSelection(["b"], "c", 2)).toEqual(["b", "c"]);
    expect(selected).toEqual(["a", "b"]);
  });
});
