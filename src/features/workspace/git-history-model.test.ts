import { describe, expect, it } from "vitest";
import { gitHistoryRequest, validateGitHistoryResponse } from "./git-history-model";

const scope = { projectId: "project", cwd: "nested", root: "/checkout/worktree" };
const sha = "a".repeat(40);
describe("read-only historical Git requests", () => {
  it("uses the selected checkout root and an immutable revision for diff and blame", () => {
    for (const kind of ["diff", "blame"] as const)
      expect(gitHistoryRequest(scope, { kind, sha, path: "src/file.ts" })).toEqual({
        command: kind === "diff" ? "git_commit_file_diff" : "git_blame",
        args: { cwd: scope.root, sha, relative: "src/file.ts" },
      });
  });
  it("bounds graph and file-history requests using the existing host contract", () => {
    expect(gitHistoryRequest(scope, { kind: "history", limit: 10000 })).toEqual({ command: "git_history", args: { cwd: scope.root, limit: 500 } });
    expect(gitHistoryRequest(scope, { kind: "fileHistory", path: "a.ts", limit: 100 }).command).toBe("git_file_history");
    expect(gitHistoryRequest(scope, { kind: "files", sha }).command).toBe("git_commit_files");
  });
  it("refuses unknown checkout identity, mutable revisions and path escapes", () => {
    expect(() => gitHistoryRequest({ projectId: "project" }, { kind: "history", limit: 100 })).toThrow();
    expect(() => gitHistoryRequest(scope, { kind: "files", sha: "HEAD" })).toThrow();
    expect(() => gitHistoryRequest(scope, { kind: "files", sha: "a".repeat(41) })).toThrow();
    for (const path of ["../secret", "a/../secret", "C:\\secret", "/secret", "a\0b"])
      expect(() => gitHistoryRequest(scope, { kind: "blame", sha, path })).toThrow();
  });
  it("rejects malformed and over-budget responses instead of rendering them as empty success", () => {
    const read = { kind: "history", limit: 100 } as const;
    expect(() => validateGitHistoryResponse(read, { head: null, commits: [{ sha: "HEAD" }] })).toThrow("invalid");
    expect(() => validateGitHistoryResponse(read, { head: null, commits: Array(501).fill({}) })).toThrow("budget");
    expect(validateGitHistoryResponse(read, { head: null, commits: [] })).toEqual({ head: null, commits: [] });
    expect(() => validateGitHistoryResponse({ kind: "blame", sha, path: "a" }, [{ line: -1 }])).toThrow("invalid");
    expect(() => validateGitHistoryResponse(read, { head: sha, commits: [{ sha, shortSha: "aaaaaaa", subject: "Change", author: "Author", timestamp: Number.MAX_VALUE }] })).toThrow("invalid");
    for (const file of [
      { relative: "../outside", status: "modified", additions: 1, deletions: 0 },
      { relative: "file.ts", status: "modified", additions: NaN, deletions: 0 },
    ]) expect(() => validateGitHistoryResponse({ kind: "files", sha }, [file])).toThrow("invalid");
    expect(() => validateGitHistoryResponse({ kind: "diff", sha, path: "a" }, { original: "a".repeat(2_000_001), current: "", status: "modified", binary: false, tooLarge: false })).toThrow("budget");
  });
});
