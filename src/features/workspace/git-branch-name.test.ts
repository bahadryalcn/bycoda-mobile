import { describe, expect, it } from "vitest";
import { branchNameProblem, isManagedBranch } from "./git-branch-name";
import { parseTaskDeliveryPlan, planMergeBlocker, taskDeliveryMergeParams, workspaceForBranch } from "./git-delivery-model";

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
  const wire = {
    action: "merge",
    token: "reviewed-plan",
    expiresAt: 8_000_000,
    expiresInMs: 75,
    workspaceId: "w",
    expectedRevision: 2,
    sourceBranchRef: "refs/heads/bycoda/s/a",
    sourceHead: "a".repeat(40),
    targetBranchRef: "refs/heads/main",
    targetHead: "b".repeat(40),
    targetDirectory: "/repo",
    targetStatusFingerprint: "target-status",
    commits: ["a reviewed commit"],
    changedPaths: ["src/app.ts"],
    overlappingPaths: [],
    checks: [],
    visualEvidence: [],
    blockers: [],
  };
  const artifacts = {
    paths: ["temp/verification/result.png"],
    hashes: { "temp/verification/result.png": "source-file-hash" },
    sourceFingerprint: "source-manifest-fingerprint",
    targetFingerprint: "target-manifest-fingerprint",
    targetHashes: { "temp/verification/result.png": null },
    blockers: [],
  };
  const parse = (payload: unknown = wire) => parseTaskDeliveryPlan(payload, "w", 2, 25);

  it("preserves the reviewed refs, heads and artifact details without trusting the Host wall clock", () => {
    const plan = parse({ ...wire, artifacts, diff: "Detailed Host patch" });
    expect(plan).toEqual({ ...wire, artifacts, deadline: 100 });
    expect(taskDeliveryMergeParams(plan, "stable-idempotency-key")).toEqual({
      workspaceId: "w", expectedRevision: 2, idempotencyKey: "stable-idempotency-key", planToken: "reviewed-plan",
    });
  });

  it("blocks merging for stale, blocked, conflicting or failing plans", () => {
    const plan = parse();
    expect(planMergeBlocker(plan, 50)).toBeNull();
    expect(planMergeBlocker(plan, 100)).toBe("expired");
    expect(planMergeBlocker({ ...plan, blockers: ["x"] }, 50)).toBe("blocked");
    expect(planMergeBlocker(parse({ ...wire, overlappingPaths: ["src/app.ts"] }), 50)).toBe("conflict");
    expect(planMergeBlocker(parse({ ...wire, committedConflict: { sourceHead: wire.sourceHead, targetHead: wire.targetHead } }), 50)).toBe("conflict");
    expect(planMergeBlocker(parse({ ...wire, artifacts: { ...artifacts, blockers: ["Artifact conflicts"] } }), 50)).toBe("blocked");
    expect(planMergeBlocker({ ...plan, checks: [{ name: "t", status: "failed" }] }, 50)).toBe("checks");
    expect(planMergeBlocker(parse({ ...wire, expiresInMs: 0 }), 25)).toBe("expired");
  });

  it.each([
    { action: "publish" },
    { workspaceId: "other" },
    { expectedRevision: 3 },
    { token: " " },
    { sourceHead: "not-a-commit" },
    { targetStatusFingerprint: undefined },
    { blockers: undefined },
    { blockers: null },
    { blockers: [7] },
    { blockers: [""] },
    { overlappingPaths: undefined },
    { checks: [{ name: "test", status: "skipped" }] },
    { expiresInMs: undefined },
    { expiresInMs: -1 },
    { expiresInMs: Number.POSITIVE_INFINITY },
    { artifacts: {} },
    { artifacts: { ...artifacts, blockers: undefined } },
  ])("fails closed for an invalid or mismatched merge plan %j", (invalid) => {
    expect(() => parse({ ...wire, ...invalid })).toThrow();
  });
});
