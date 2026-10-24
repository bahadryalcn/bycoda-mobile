import { expect, it } from "vitest";
import { readStashes, stashRequest, uncertainStashWrite } from "./git-stash-model";
const scope = { projectId: "p", root: "/worktree" };
const stash = { index: 2, sha: "a".repeat(40), message: "Saved work", timestamp: 1700000000 };

it("pins stash actions to the reviewed immutable identity and checkout", () => {
  expect(stashRequest(scope, { kind: "pop", stash })).toEqual({ command: "git_stash_action", args: { cwd: "/worktree", action: "pop", index: 2, expectedSha: stash.sha } });
  expect(stashRequest(scope, { kind: "clear", stashes: [stash] })).toEqual({ command: "git_stash_clear", args: { cwd: "/worktree", expectedShas: [stash.sha] } });
  expect(stashRequest(scope, { kind: "create", mode: "staged", message: " draft " })).toEqual({ command: "git_stash", args: { cwd: "/worktree", mode: "staged", message: "draft" } });
});
it("rejects stale or malformed identities and over-budget lists before an action", () => {
  expect(() => readStashes([stash, stash])).toThrow();
  expect(() => readStashes([{ ...stash, sha: "HEAD" }])).toThrow();
  expect(() => readStashes(Array(1001).fill(stash))).toThrow();
  expect(() => stashRequest({ projectId: "p" }, { kind: "drop", stash })).toThrow();
  expect(() => stashRequest(scope, { kind: "clear", stashes: [] })).toThrow();
  expect(() => stashRequest(scope, { kind: "create", mode: "tracked", message: "\0" })).toThrow();
  expect(uncertainStashWrite({ uncertain: true })).toBe(true);
  expect(uncertainStashWrite(new Error("Rejected"))).toBe(false);
});
