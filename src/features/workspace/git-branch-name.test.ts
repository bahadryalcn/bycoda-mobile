import { describe, expect, it } from "vitest";
import { branchNameProblem, isManagedBranch } from "./git-branch-name";
import { planMergeBlocker, workspaceForBranch, type DeliveryPlan } from "./git-delivery-model";

describe("branch names", () => {
  it("accepts ordinary names", () => {
    for (const ok of ["feature/x", "fix-1", "release/1.2", "a@b"]) expect(branchNameProblem(ok)).toBeNull();
  });
  it("rejects invalid ref names", () => {
    expect(branchNameProblem("  ")).toBe("empty");
    for (const bad of ["a b", "a..b", "-x", "/x", "x/", "x.", "x.lock", "a//b", "a@{b", "a~1", "a^", "a:b", "a?", "a*", "a[", "a\\b", "@", ".hidden", "a/.b"])
      expect(branchNameProblem(bad)).toBe("invalid");
  });
  it("reserves the managed prefixes", () => {
    expect(branchNameProblem("bycoda/s/abc")).toBe("managed");
    expect(branchNameProblem("bycoda/t/abc")).toBe("managed");
    expect(branchNameProblem("bycoda/other")).toBeNull();
    expect(isManagedBranch("refs/heads/bycoda/t/x")).toBe(true);
    expect(isManagedBranch("main")).toBe(false);
  });
});

describe("delivery model", () => {
  const workspace = { id: "w", branchRef: "refs/heads/bycoda/s/a", targetBranchRef: "main", revision: 2, state: "active" };
  it("finds the workspace for a managed branch", () => {
    expect(workspaceForBranch([workspace], "bycoda/s/a")).toBe(workspace);
    expect(workspaceForBranch([workspace], "main")).toBeUndefined();
    expect(workspaceForBranch([workspace], null)).toBeUndefined();
  });
  const plan: DeliveryPlan = {
    token: "t", expiresAt: 100, workspaceId: "w", expectedRevision: 2, sourceBranchRef: "a",
    targetBranchRef: "main", commits: [], changedPaths: [], overlappingPaths: [], checks: [], blockers: [],
  };
  it("blocks merging for stale, blocked, conflicting or failing plans", () => {
    expect(planMergeBlocker(plan, 50)).toBeNull();
    expect(planMergeBlocker(plan, 100)).toBe("expired");
    expect(planMergeBlocker({ ...plan, blockers: ["x"] }, 50)).toBe("blocked");
    expect(planMergeBlocker({ ...plan, committedConflict: {} }, 50)).toBe("conflict");
    expect(planMergeBlocker({ ...plan, checks: [{ name: "t", status: "failed" }] }, 50)).toBe("checks");
  });
});
