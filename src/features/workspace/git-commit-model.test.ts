import { describe, expect, it } from "vitest";
import { gitCommitBlock } from "./git-commit-model";

const ready = { message: "Fix", stagedCount: 1, hasConflicts: false, hasOperation: false };

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
