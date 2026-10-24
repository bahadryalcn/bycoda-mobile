import { expect, it } from "vitest";
import { selectiveHunks, selectedStageContents } from "./git-selective-model";
it("stages exact selected additions/removals and keeps every unselected change outside the index", () => {
  const original = "alpha\nbeta\ngamma\ndelta\n"; const current = "alpha\nBETA\ngamma\nDELTA\n";
  const hunks = selectiveHunks(original, current);
  expect(hunks).toHaveLength(2);
  expect(selectedStageContents(original, hunks, new Set(hunks[0].lines.map((line) => line.id)))).toBe("alpha\nBETA\ngamma\ndelta\n");
  expect(selectedStageContents(original, hunks, new Set([hunks[0].lines.find((line) => line.kind === "add")!.id]))).toBe("alpha\nbeta\nBETA\ngamma\ndelta\n");
});
it("preserves CRLF and missing final newlines, including individual deleted lines", () => {
  const original = "a\r\nb\r\nc"; const current = "a\r\nc";
  const hunks = selectiveHunks(original, current);
  expect(selectedStageContents(original, hunks, new Set(hunks.flatMap((hunk) => hunk.lines.map((line) => line.id))))).toBe(current);
  const inserted = selectiveHunks("", "one\r\ntwo");
  expect(selectedStageContents("", inserted, new Set([inserted[0].lines[1].id]))).toBe("two");
  expect(() => selectiveHunks("a\0", "b")).toThrow();
  expect(() => selectedStageContents(original, hunks, new Set(["stale"]))).toThrow();
});
