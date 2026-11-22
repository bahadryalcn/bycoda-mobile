import { describe, expect, it } from "vitest";
import { gitAheadCount, gitBehindCount, gitChangedCount, gitCommitAction, gitCommitBlock, gitMergeSuggestion, gitPushTarget } from "./git-commit-model";

it("applies one smart-commit rule to every commit button", () => {
  const input = { message: "Fix", hasConflicts: false, hasOperation: false };
  expect(gitCommitAction({ ...input, files: [{ staged: false, unstaged: true }] })).toMatchObject({ stageAll: true, disabled: false });
  expect(gitCommitAction({ ...input, files: [{ staged: true, unstaged: false }, { staged: false, unstaged: true }] })).toMatchObject({ stageAll: false, disabled: false });
  expect(gitCommitAction({ ...input, files: [] })).toMatchObject({ block: "clean", disabled: true });
});

it("keeps a typed commit message when a suggestion is applied", () => {
  expect(gitMergeSuggestion("", "Add login")).toBe("Add login");
  expect(gitMergeSuggestion("  ", "Add login")).toBe("Add login");
  expect(gitMergeSuggestion("WIP fix\n", "Add login")).toBe("WIP fix\n\nAdd login");
});

const ready = { message: "Fix", stagedCount: 1, hasConflicts: false, hasOperation: false };

it("uses the singular for one commit or file and the plural otherwise", () => {
  const copy = (_tr: string, en: string, values?: Record<string, string | number>) =>
    en.replace(/\{(p\d)\}/g, (_match, key: string) => String(values?.[key]));
  expect(gitAheadCount(1, copy)).toBe("1 commit to push");
  expect(gitAheadCount(2, copy)).toBe("2 commits to push");
  expect(gitBehindCount(1, copy)).toBe("Get 1 new commit");
  expect(gitBehindCount(3, copy)).toBe("Get 3 new commits");
  expect(gitChangedCount(1, 0, copy)).toBe("1 file changed, 0 staged");
  expect(gitChangedCount(3, 1, copy)).toBe("3 files changed, 1 staged");
});

it("names the exact push destination, including a branch that has no upstream yet", () => {
  expect(gitPushTarget("origin/release", "origin", "main")).toBe("origin/release");
  expect(gitPushTarget(null, "origin", "feature")).toBe("origin/feature");
  expect(gitPushTarget(null, "origin", null)).toBe("origin");
  expect(gitPushTarget(null, null, "feature")).toBeNull();
});

it("allows Commit only when a message and staged files exist without conflicts or a running operation", () => {
  expect(gitCommitBlock(ready)).toBeUndefined();
});

it("names the first blocker so the disabled explanation matches the real state", () => {
  expect(gitCommitBlock({ ...ready, message: "   " })).toBe("message");
  expect(gitCommitBlock({ ...ready, stagedCount: 0 })).toBe("staged");
  expect(gitCommitBlock({ ...ready, hasConflicts: true })).toBe("operation");
  expect(gitCommitBlock({ ...ready, hasOperation: true, stagedCount: 0 })).toBe("operation");
});

import { gitPrimaryAction } from "./git-commit-model";

const base = { message: "Fix", files: [], ahead: 0, hasRemote: true, hasConflicts: false, hasOperation: false };
const staged = { staged: true, unstaged: false };
const unstaged = { staged: false, unstaged: true };

describe("primary action", () => {
  it("is disabled with nothing changed and nothing to push", () => {
    expect(gitPrimaryAction(base)).toMatchObject({ kind: "commit", disabled: true, block: "clean" });
  });
  it("stages everything first when only unstaged changes exist", () => {
    expect(gitPrimaryAction({ ...base, files: [unstaged] })).toMatchObject({ kind: "commit", stageAll: true, disabled: false });
    expect(gitPrimaryAction({ ...base, files: [unstaged], message: " " })).toMatchObject({ stageAll: true, disabled: true, block: "message" });
  });
  it("commits only the staged files when something is staged", () => {
    expect(gitPrimaryAction({ ...base, files: [staged, unstaged] })).toMatchObject({ kind: "commit", stageAll: false, disabled: false });
  });
  it("becomes Push when clean and ahead of the upstream, without needing a message", () => {
    expect(gitPrimaryAction({ ...base, ahead: 2, message: "" })).toEqual({ kind: "push", ahead: 2, disabled: false });
    expect(gitPrimaryAction({ ...base, ahead: 2, hasRemote: false })).toMatchObject({ kind: "commit", disabled: true });
  });
  it("stays blocked during conflicts or an operation", () => {
    expect(gitPrimaryAction({ ...base, files: [staged], hasConflicts: true })).toMatchObject({ disabled: true, block: "operation" });
    expect(gitPrimaryAction({ ...base, ahead: 1, hasOperation: true })).toMatchObject({ kind: "commit", disabled: true });
  });
});
