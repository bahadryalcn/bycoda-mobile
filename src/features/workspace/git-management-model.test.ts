import { expect, it } from "vitest";
import { readonlyRequest } from "@/remote/request-policy";
import { GitManagementIssueError, gitManagementRequest, managementSnapshotRequest, managementDraft, pullRequestRepository, readGitRemotes, readGitTags, safeRemoteUrl, type GitManagementAction } from "./git-management-model";

const scope = { projectId: "project", cwd: "/project", root: "/reviewed/worktree" };
const commit = "a".repeat(40);

it("maps named Git tasks to exact checkout-scoped host contracts", () => {
  const cases: Array<[GitManagementAction, string, Record<string, unknown>]> = [
    ["renameBranch", "git_rename_branch", { from: "feature", to: "renamed" }],
    ["deleteBranch", "git_delete_branch", { name: "feature", force: false }],
    ["deleteRemoteBranch", "git_delete_remote_branch", { name: "feature", remote: "origin" }],
    ["createTag", "git_create_tag", { name: "feature", sha: commit }],
    ["deleteTag", "git_delete_tag", { name: "feature" }],
    ["addRemote", "git_remote_add", { name: "feature", url: "https://example.test/repository.git" }],
    ["removeRemote", "git_remote_remove", { name: "feature" }],
    ["merge", "git_merge", { reference: "renamed" }], ["rebase", "git_rebase", { reference: "renamed" }],
    ["cherryPick", "git_cherry_pick", { sha: commit }], ["revert", "git_revert", { sha: commit }],
    ["reset", "git_reset", { sha: commit, mode: "soft" }], ["undoCommit", "git_undo_last_commit", {}],
    ["createPr", "git_pr_create", { title: "Review this", body: "Description", base: "main", head: "feature" }],
  ];
  for (const [action, command, args] of cases) {
    expect(gitManagementRequest(scope, { ...managementDraft(action), name: "feature", target: "renamed", remote: "origin", sha: commit,
      url: "https://example.test/repository.git", title: "Review this", body: "Description", base: "main", head: "feature" }))
      .toEqual({ command, args: { cwd: scope.root, ...args } });
  }
});

it("requires immutable full commit identifiers and explicit destructive reset mode", () => {
  for (const action of ["cherryPick", "revert", "reset", "createTag"] as const) {
    expect(() => gitManagementRequest(scope, { ...managementDraft(action), name: "v1", sha: "HEAD~1" })).toThrow();
    expect(() => gitManagementRequest(scope, { ...managementDraft(action), name: "v1", sha: "abcd" })).toThrow();
  }
  expect(gitManagementRequest(scope, { ...managementDraft("reset"), sha: commit, mode: "hard" }).args.mode).toBe("hard");
  expect(() => gitManagementRequest({ projectId: "p" }, managementDraft("undoCommit"))).toThrow();
});

it("does not accept option-like refs, newline URLs or invalid remote/tag payloads", () => {
  expect(() => gitManagementRequest(scope, { ...managementDraft("merge"), target: "--abort" })).toThrow();
  expect(() => gitManagementRequest(scope, { ...managementDraft("renameBranch"), name: "main", target: "main" })).toThrow();
  expect(() => gitManagementRequest(scope, { ...managementDraft("addRemote"), name: "origin", url: "https://example.test\n--upload-pack=bad" })).toThrow();
  expect(() => readGitTags(["valid", null])).toThrow();
  expect(() => readGitRemotes([{ name: "origin", url: {} }])).toThrow();
  expect(readGitRemotes([{ name: "origin", url: "https://example.test/repo" }])).toEqual([{ kind: "remote", name: "origin", url: "https://example.test/repo" }]);
});

it("binds remote/tag/ref writes to reviewed snapshots and removes credentials from displayed URLs", () => {
  const snapshot = { token: "f".repeat(64), refs: { "refs/remotes/origin/feature": commit, "refs/tags/v1": commit } };
  expect(managementSnapshotRequest(scope, { ...managementDraft("deleteRemoteBranch"), remote: "origin", name: "feature" }, snapshot).args)
    .toMatchObject({ expectedSnapshot: snapshot.token, expectedTargetSha: commit });
  expect(managementSnapshotRequest(scope, { ...managementDraft("deleteTag"), name: "v1" }, snapshot).args).toMatchObject({ expectedTargetSha: commit });
  expect(() => managementSnapshotRequest(scope, { ...managementDraft("merge"), target: "missing" }, snapshot)).toThrow();
  expect(safeRemoteUrl("https://user:secret@example.test/repo?token=hidden#key")).toBe("https://example.test/repo");
});

it("requires the provider destination URL and owner/name to identify the same repository", () => {
  expect(pullRequestRepository({ url: "https://github.com/owner/repo", nameWithOwner: "owner/repo" })).toBe("github.com/owner/repo");
  expect(() => pullRequestRepository({ url: "https://github.com/other/repo", nameWithOwner: "owner/repo" })).toThrow();
  expect(() => pullRequestRepository({ url: "https://token@github.com/owner/repo", nameWithOwner: "owner/repo" })).toThrow();
});

it("reports validation as typed issue codes so the form can localize them", () => {
  const issueOf = (run: () => unknown) => {
    try { run(); return undefined; } catch (reason) { return reason instanceof GitManagementIssueError ? reason.issue : "untyped"; }
  };
  const snapshot = { token: "f".repeat(64), refs: {} };
  expect(issueOf(() => gitManagementRequest(scope, { ...managementDraft("renameBranch"), name: "main", target: "main" }))).toBe("branchNames");
  expect(issueOf(() => gitManagementRequest(scope, managementDraft("deleteBranch")))).toBe("chooseBranch");
  expect(issueOf(() => gitManagementRequest(scope, { ...managementDraft("createTag"), name: "v1", sha: "abcd" }))).toBe("tagSha");
  expect(issueOf(() => gitManagementRequest(scope, { ...managementDraft("addRemote"), name: "origin", url: "" }))).toBe("remoteUrl");
  expect(issueOf(() => gitManagementRequest(scope, managementDraft("reset")))).toBe("commitSha");
  expect(issueOf(() => gitManagementRequest({ projectId: "p" }, managementDraft("undoCommit")))).toBe("rootUnavailable");
  expect(issueOf(() => managementSnapshotRequest(scope, { ...managementDraft("merge"), target: "missing" }, snapshot))).toBe("targetChanged");
  expect(issueOf(() => managementSnapshotRequest(scope, managementDraft("undoCommit"), { token: "short", refs: {} }))).toBe("snapshotInvalid");
  expect(issueOf(() => gitManagementRequest(scope, managementDraft("undoCommit")))).toBeUndefined();
});

it("permits retries only for the added explicit reads, never management writes", () => {
  expect(readonlyRequest("workspace.run", { command: "git_management_snapshot" })).toBe(true);
  expect(readonlyRequest("workspace.run", { command: "git_pr_destination" })).toBe(true);
  expect(readonlyRequest("workspace.run", { command: "git_pr_create" })).toBe(false);
  expect(readonlyRequest("workspace.run", { command: "git_delete_remote_branch" })).toBe(false);
});
