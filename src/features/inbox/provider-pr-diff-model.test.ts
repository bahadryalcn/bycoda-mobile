import { expect, it } from "vitest";
import { filterPrDiffFiles, pendingByAnchor, prAnchorKey, prDiffFiles } from "./provider-pr-diff-model";
import { prReviewLines, reviewedPrSubmission, type PrReviewContext } from "./provider-review-model";
import { isTestFile } from "../pull-requests/model/list";

const head = "a".repeat(40);
const patch = [
  "diff --git a/src/file.ts b/src/file.ts",
  "--- a/src/file.ts",
  "+++ b/src/file.ts",
  "@@ -10,3 +10,4 @@ export function run() {",
  " keep();",
  "-old();",
  "+next();",
  "+extra();",
  " done();",
  "\\ No newline at end of file",
  "diff --git a/src/new.test.ts b/src/new.test.ts",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/src/new.test.ts",
  "@@ -0,0 +1,2 @@",
  "+one",
  "+two",
  "diff --git a/src/gone.ts b/src/gone.ts",
  "deleted file mode 100644",
  "--- a/src/gone.ts",
  "+++ /dev/null",
  "@@ -1 +0,0 @@",
  "-bye",
  "diff --git a/src/before.ts b/src/after.ts",
  "similarity index 90%",
  "rename from src/before.ts",
  "rename to src/after.ts",
  "--- a/src/before.ts",
  "+++ b/src/after.ts",
  "@@ -3 +3 @@",
  "-a",
  "+b",
  "",
].join("\n");
const context = (truncated = false): PrReviewContext => ({
  commitId: head, headOid: head, additions: 6, deletions: 3, truncated, patch,
  files: [
    { path: "src/file.ts", additions: 2, deletions: 1 },
    { path: "src/new.test.ts", additions: 2, deletions: 0 },
    { path: "src/gone.ts", additions: 0, deletions: 1 },
    { path: "src/after.ts", additions: 1, deletions: 1 },
    { path: "assets/logo.png", additions: 0, deletions: 0 },
  ],
});

it("splits the patch per file with hunks, gutters and change kinds in provider order", () => {
  const files = prDiffFiles(context());
  expect(files.map((file) => [file.path, file.status])).toEqual([
    ["src/file.ts", "modified"], ["src/new.test.ts", "added"], ["src/gone.ts", "deleted"], ["src/after.ts", "renamed"], ["assets/logo.png", "modified"],
  ]);
  expect(files[3]?.previousPath).toBe("src/before.ts");
  expect(files[4]?.rows).toEqual([]);
  const first = files[0]!.rows;
  expect(first[0]).toMatchObject({ type: "hunk", header: "@@ -10,3 +10,4 @@" });
  expect(first.slice(1).map((row) => row.type === "line" && [row.kind, row.oldLine, row.newLine, row.text])).toEqual([
    ["context", 10, 10, "keep();"], ["remove", 11, undefined, "old();"], ["add", undefined, 11, "next();"],
    ["add", undefined, 12, "extra();"], ["context", 12, 13, "done();"],
  ]);
});

it("anchors every line exactly where review submission accepts it", () => {
  const value = context();
  const accepted = new Set(prReviewLines(value).map((line) => `${line.path}:${line.side}:${line.line}`));
  const anchors = prDiffFiles(value).flatMap((file) => file.rows.flatMap((row) => row.type === "line" && row.anchor ? [`${file.path}:${row.anchor.side}:${row.anchor.line}`] : []));
  expect(anchors.length).toBe(accepted.size);
  for (const anchor of anchors) expect(accepted.has(anchor)).toBe(true);
  // The removed line is a LEFT comment at its old number; the deleted file's line too.
  expect(anchors).toContain("src/file.ts:LEFT:11");
  expect(anchors).toContain("src/gone.ts:LEFT:1");
  expect(() => reviewedPrSubmission(value, "COMMENT", "Summary", [
    { path: "src/file.ts", side: "LEFT", line: 11, body: "Why?" },
    { path: "src/file.ts", side: "RIGHT", line: 12, body: "Name" },
  ])).not.toThrow();
});

it("shows a partial diff without any comment anchor, keeping files before a cut-off tail", () => {
  const cut = { ...context(true), patch: `${patch}diff --git a/src/tail.ts b/src/tail.ts
--- a/src/tail.ts
+++ b/src/tail.ts
@@ -1,9 +1,9 @@
-x
not a diff line` };
  const files = prDiffFiles({ ...cut, files: [...cut.files, { path: "src/tail.ts", additions: 1, deletions: 1 }] });
  expect(files[0]?.rows.length).toBeGreaterThan(0);
  const rows = files.flatMap((file) => file.rows);
  expect(rows.some((row) => row.type === "line")).toBe(true);
  expect(rows.some((row) => row.type === "line" && row.anchor)).toBe(false);
});

it("filters by path text and test files, and groups pending comments by anchor", () => {
  const files = prDiffFiles(context());
  expect(filterPrDiffFiles(files, { query: "", hideTests: true, isTest: isTestFile }).map((file) => file.path)).not.toContain("src/new.test.ts");
  expect(filterPrDiffFiles(files, { query: "AFTER", hideTests: false, isTest: isTestFile }).map((file) => file.path)).toEqual(["src/after.ts"]);
  const pending = pendingByAnchor([
    { path: "src/other.ts", side: "RIGHT", line: 1, body: "x" },
    { path: "src/file.ts", side: "LEFT", line: 11, body: "y" },
  ], "src/file.ts");
  expect(pending.get(prAnchorKey("src/file.ts", { side: "LEFT", line: 11 }))).toMatchObject({ index: 1 });
  expect(pending.size).toBe(1);
});
