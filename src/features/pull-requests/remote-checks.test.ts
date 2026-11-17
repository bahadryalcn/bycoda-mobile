import { describe, expect, it } from "vitest";
import { inboxOperationWrites, nativeInboxCommand, parseRemoteInboxOperation } from "../../../../src/features/inbox/model/remoteInbox";

describe("remote pull request checks", () => {
  const projects = [{ id: "project", cwd: "/repo" }];
  const item = { provider: "github", kind: "pr", number: 7, repo: "owner/repo", projectPath: "/repo" };

  it("routes a scoped GitHub PR as a read", () => {
    const operation = parseRemoteInboxOperation({ action: "checks", projectId: "project", item }, projects);
    if (operation.action !== "checks") throw new Error("Unexpected operation");
    expect(inboxOperationWrites(operation)).toBe(false);
    expect(nativeInboxCommand(operation)).toEqual({ command: "git_github_pr_checks", args: { cwd: "/repo", repo: "owner/repo", number: 7 } });
  });

  it("rejects other providers, issue targets and foreign projects", () => {
    for (const target of [{ ...item, provider: "gitlab" }, { ...item, kind: "issue" }, { ...item, projectPath: "/other" }]) {
      expect(() => parseRemoteInboxOperation({ action: "checks", item: target }, projects)).toThrow();
    }
  });
});
