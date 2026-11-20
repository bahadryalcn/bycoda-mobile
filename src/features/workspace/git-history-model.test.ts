import { describe, expect, it } from "vitest";
import { appendHistoryPage, gitHistoryRequest, historyReadSize, historySkipIgnored, validateGitHistoryResponse } from "./git-history-model";

const scope = { projectId: "project", cwd: "nested", root: "/checkout/worktree" };
const sha = "a".repeat(40);
const commitAt = (index: number) => ({
  sha: index.toString(16).padStart(40, "0"), shortSha: index.toString(16).padStart(7, "0"),
  subject: `Commit ${index}`, author: "Author", timestamp: 1_700_000_000 + index,
}) as Parameters<typeof appendHistoryPage>[1][number];
const commitsFrom = (start: number, count: number) => Array.from({ length: count }, (_, index) => commitAt(start + index));

describe("paged graph history", () => {
  it("sends the pagination offset only for a continuation read", () => {
    expect(gitHistoryRequest(scope, { kind: "history", limit: 100, skip: 100 }))
      .toEqual({ command: "git_history", args: { cwd: scope.root, limit: 100, skip: 100 } });
    expect(gitHistoryRequest(scope, { kind: "history", limit: 100, skip: 0 }).args).not.toHaveProperty("skip");
    expect(gitHistoryRequest(scope, { kind: "history", limit: 100 }).args).not.toHaveProperty("skip");
    for (const skip of [-1, 500, 1e300])
      expect(() => gitHistoryRequest(scope, { kind: "history", limit: 100, skip })).toThrow("offset");
  });
  it("keeps the depth a refresh re-reads within the mobile budget", () => {
    expect(historyReadSize(0)).toBe(100);
    expect(historyReadSize(40)).toBe(100);
    expect(historyReadSize(300)).toBe(300);
    expect(historyReadSize(9000)).toBe(500);
  });
  it("appends the next page after the commits already shown", () => {
    const shown = commitsFrom(0, 100);
    const page = commitsFrom(100, 100);
    const { fresh, ended } = appendHistoryPage(shown, page, 100);
    expect(fresh).toEqual(page);
    expect(ended).toBe(false);
  });
  it("never lists a commit twice, even inside one page", () => {
    const shown = commitsFrom(0, 100);
    const page = [...commitsFrom(98, 4), commitAt(101)];
    expect(appendHistoryPage(shown, page, 100).fresh.map((commit) => commit.subject))
      .toEqual(["Commit 100", "Commit 101"]);
  });
  it("ends on a short page, an empty page or the mobile budget", () => {
    const shown = commitsFrom(0, 100);
    expect(appendHistoryPage(shown, commitsFrom(100, 40), 100).ended).toBe(true);
    expect(appendHistoryPage(shown, [], 100).ended).toBe(true);
    expect(appendHistoryPage(shown, commitsFrom(0, 100), 100)).toEqual({ fresh: [], ended: true });
    expect(appendHistoryPage(commitsFrom(0, 400), commitsFrom(400, 100), 100).ended).toBe(true);
  });
  it("detects an older Host that ignored the offset and re-sent the first commits", () => {
    const shown = commitsFrom(0, 100);
    expect(historySkipIgnored(shown, commitsFrom(0, 100))).toBe(true);
    expect(historySkipIgnored(shown, commitsFrom(100, 100))).toBe(false);
    expect(historySkipIgnored(shown, [])).toBe(false);
  });
  it("reads an older Host's longer prefix and appends only what is new", () => {
    const shown = commitsFrom(0, 100);
    const prefix = commitsFrom(0, 200);
    expect(historySkipIgnored(shown, commitsFrom(0, 100))).toBe(true);
    const { fresh, ended } = appendHistoryPage(shown, prefix, 200);
    expect(fresh).toEqual(commitsFrom(100, 100));
    expect(ended).toBe(false);
    expect(appendHistoryPage(shown, commitsFrom(0, 130), 200)).toMatchObject({ ended: true });
  });
});
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
