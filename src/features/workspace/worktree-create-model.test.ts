import { describe, expect, it } from "vitest";
import { availableWorktreeBranches, readCreatedWorktree, unknownWorktreeResult, worktreeCreateRequest } from "./worktree-create-model";
import type { HostWorktree } from "@/remote/types";

const branches = { current: "main", branches: ["main", "feature"], remotes: [{ remote: "origin", name: "main" }] };
const scope = { machineId: "machine", projectId: "project", cwd: "/repo/selected" };
const main: HostWorktree = { path: "/repo", branch: "main", head: "a".repeat(40), isMain: true, missing: false };
describe("reviewed worktree creation", () => {
  it("preserves source checkout and exact remote base while excluding occupied local branches", () => {
    expect(availableWorktreeBranches(branches, [main])).toEqual(["feature"]);
    expect(worktreeCreateRequest(scope, { branch: " feature/new ", base: "origin/main", existing: false }, branches, [main])).toEqual({ projectId: "project", cwd: "/repo/selected", branch: "feature/new", base: "origin/main", existing: false });
    expect(worktreeCreateRequest(scope, { branch: "feature", base: "obsolete", existing: true }, branches, [main]).existing).toBe(true);
  });
  it("rejects stale selections, occupied branches and unsafe names without altering a draft", () => {
    for (const branch of ["main", "-bad", "a..b", "a.lock", "x/.hidden", "bad name", "@bad", "a//b"]) {
      expect(() => worktreeCreateRequest(scope, { branch, base: "HEAD", existing: false }, branches, [main])).toThrow();
    }
    expect(() => worktreeCreateRequest(scope, { branch: "gone", base: "HEAD", existing: true }, branches, [])).toThrow();
    expect(() => worktreeCreateRequest(scope, { branch: "feature", base: "HEAD", existing: false }, branches, [])).toThrow();
    expect(() => worktreeCreateRequest(scope, { branch: "new", base: "gone", existing: false }, branches, [])).toThrow();
  });
  it("keeps missing, mismatched and malformed success responses uncertain", () => {
    const created = { ...main, branch: "feature", isMain: false };
    expect(readCreatedWorktree(created, "feature")).toEqual(created);
    for (const result of [undefined, main, { ...created, branch: "other" }, { ...created, head: "b".repeat(41) }, { ...created, missing: true }]) {
      try { readCreatedWorktree(result, "feature"); throw new Error("Expected rejection"); }
      catch (error) { expect(unknownWorktreeResult(error)).toBe(true); }
    }
  });
});
