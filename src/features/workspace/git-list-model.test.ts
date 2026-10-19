import { expect, it } from "vitest";
import { gitListRows } from "./git-list-model";
import type { GitChangedFile } from "./wire";

const file = (relative: string, staged: boolean, unstaged: boolean): GitChangedFile => ({
  path: "/project/" + relative,
  relative,
  status: "modified",
  staged,
  unstaged,
  additions: 1,
  deletions: 0,
});

it("keeps the staged and unstaged parts of one file separately actionable", () => {
  const changed = file("src/chat.tsx", true, true);
  expect(gitListRows([changed], "", "all")).toEqual([
    { kind: "group", key: "unstaged", staged: false, count: 1 },
    { kind: "file", key: "unstaged:src/chat.tsx", staged: false, file: changed },
    { kind: "group", key: "staged", staged: true, count: 1 },
    { kind: "file", key: "staged:src/chat.tsx", staged: true, file: changed },
  ]);
});

it("searches full paths case insensitively across host path separators", () => {
  const changed = file("src\\Chat\\Composer.tsx", true, false);
  const files = [changed, file("src/chat/model.ts", false, true)];
  const rows = gitListRows(files, "  SRC/chat/COMP  ", "staged");
  expect(rows).toHaveLength(2);
  expect(rows[1]).toMatchObject({ file: changed, staged: true });
  expect(files).toHaveLength(2);
});

it("does not report clean state for a filter with no matches or invent an empty group", () => {
  expect(gitListRows([file("a.ts", false, true)], "", "staged")).toEqual([]);
  expect(gitListRows([file("a.ts", false, true)], "missing", "all")).toEqual([]);
  expect(gitListRows([], "", "all")).toEqual([]);
});
