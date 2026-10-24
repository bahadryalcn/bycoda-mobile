import { expect, it } from "vitest";
import { prReviewLines, readPrReviewContext, reviewedPrSubmission } from "./provider-review-model";
const context = { commitId: "a".repeat(40), headOid: "a".repeat(40), additions: 1, deletions: 1, files: [{ path: "src/example.ts", additions: 1, deletions: 1 }], patch: "diff --git a/src/example.ts b/src/example.ts\n--- a/src/example.ts\n+++ b/src/example.ts\n@@ -2,2 +2,2 @@\n context\n-old\n+new\n", truncated: false };
it("pins displayed inline locations to the reviewed commit and correct side", () => {
  const value = readPrReviewContext(context); const lines = prReviewLines(value);
  expect(lines.map(({ line, side, kind }) => ({ line, side, kind }))).toEqual([{ line: 2, side: "RIGHT", kind: "context" }, { line: 3, side: "LEFT", kind: "remove" }, { line: 3, side: "RIGHT", kind: "add" }]);
  expect(reviewedPrSubmission(value, "REQUEST_CHANGES", "Please check this", [{ path: "src/example.ts", line: 3, side: "LEFT", body: "Keep this behavior" }])).toEqual({ commitId: context.commitId, event: "REQUEST_CHANGES", body: "Please check this", comments: [{ path: "src/example.ts", line: 3, side: "LEFT", body: "Keep this behavior" }] });
  expect(() => reviewedPrSubmission(value, "COMMENT", "Review", [{ path: "src/example.ts", line: 99, side: "RIGHT", body: "Not shown" }])).toThrow(/displayed/);
});
it("refuses mismatched head/file identities and disables inline anchors on partial diffs", () => {
  expect(() => readPrReviewContext({ ...context, headOid: "b".repeat(40) })).toThrow(/Invalid/);
  expect(() => prReviewLines({ ...context, files: [] })).toThrow(/identity/);
  expect(() => prReviewLines({ ...context, patch: context.patch.replace("+new\n", "") })).toThrow();
  expect(prReviewLines({ ...context, truncated: true })).toEqual([]);
  expect(() => reviewedPrSubmission({ ...context, truncated: true }, "COMMENT", "Review", [{ path: "src/example.ts", line: 3, side: "RIGHT", body: "Partial" }])).toThrow(/complete/);
  expect(() => readPrReviewContext({ ...context, patch: "x".repeat(2 * 1024 * 1024 + 1) })).toThrow(/Invalid/);
});
it("allows summary-only review for a valid empty diff without inventing anchors", () => {
  const empty = { ...context, files: [], additions: 0, deletions: 0, patch: "" };
  expect(prReviewLines(empty)).toEqual([]);
  expect(reviewedPrSubmission(empty, "COMMENT", "No textual changes", [])).toMatchObject({ body: "No textual changes", comments: [] });
});
