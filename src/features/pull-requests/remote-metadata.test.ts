import { expect, it, vi } from "vitest";
vi.mock("../../../../host/notes/host-notes", () => ({ hostInbox: vi.fn() }));
import { inboxOperationWrites, nativeInboxCommand, parseRemoteInboxOperation } from "../../../../src/features/inbox/model/remoteInbox";
import { executeDesktopInboxOperation } from "../../../../src/features/connections/model/desktopInboxOperation";
import { handleInboxRpc } from "../../../../host/server/rpc-inbox";
const item = { provider: "github", kind: "pr", number: 1, repo: "owner/repo", projectPath: "C:/repo" };
const projects = [{ id: "project", cwd: "C:/repo" }];
const parse = (extra: Record<string, unknown>) => parseRemoteInboxOperation({ item, ...extra }, projects);
it("routes reads and writes through finite native commands", () => {
  for (const action of ["reviewers", "labels"] as const) {
    const operation = parse({ action, mode: "list" });
    expect(inboxOperationWrites(operation)).toBe(false);
    expect(nativeInboxCommand(operation as Exclude<typeof operation, {action: "list" | "providers"}>).command).toBe(`git_github_pr_${action}`);
  }
  const operation = parse({ action: "reviewers", mode: "request", logins: ["alice"] });
  expect(inboxOperationWrites(operation)).toBe(true);
  expect(nativeInboxCommand(operation as Exclude<typeof operation, {action: "list" | "providers"}>).args).toMatchObject({ repo: "owner/repo", number: 1, mode: "request", logins: ["alice"] });
  expect(inboxOperationWrites(parse({ action: "labels", mode: "add", names: ["needs,review"] }))).toBe(true);
  expect(inboxOperationWrites(parse({ action: "reaction", mode: "remove", subjectId: "IC_123", content: "HEART" }))).toBe(true);
});
it("rejects foreign providers/projects, injected values and malformed mutations", () => {
  for (const extra of [
    { action: "labels", mode: "remove", names: [] },
    { action: "reviewers", mode: "request", logins: ["--repo"] },
    { action: "reviewers", mode: "request", logins: ["alice\n"] },
    { action: "labels", mode: "add", names: ["bad\0label"] },
    { action: "reaction", mode: "add", subjectId: "IC_123", content: "INVALID" },
    { action: "reaction", mode: "add", subjectId: "bad id", content: "HEART" },
    { action: "labels", mode: "list", item: { ...item, provider: "gitlab" } },
    { action: "labels", mode: "list", item: { ...item, projectPath: "C:/other" } },
  ]) expect(() => parse(extra)).toThrow();
});
it("dispatches checks and metadata through the actual desktop allowlist", async () => {
  const invoke = vi.fn().mockResolvedValue({ updated: true }), list = vi.fn();
  for (const input of [
    { action: "checks" }, { action: "reviewers", mode: "list" }, { action: "labels", mode: "add", names: ["bug"] },
    { action: "reaction", mode: "add", subjectId: "IC_123", content: "HEART" },
  ]) await executeDesktopInboxOperation(parse(input), { invoke, list });
  expect(invoke.mock.calls.map(call => call[0])).toEqual(["git_github_pr_checks", "git_github_pr_reviewers", "git_github_pr_labels", "git_github_pr_reaction"]);
  expect(list).not.toHaveBeenCalled();
});
it("requires the operation-specific confirmation token at the Host boundary", async () => {
  const enqueue = vi.fn().mockResolvedValue({ id: "job", state: "queued" });
  const dependencies = { engine: { store: { projects: async () => projects } }, providerInbox: { request: enqueue } } as unknown as Parameters<typeof handleInboxRpc>[0];
  for (const [operation, token] of [
    [{ action: "reviewers", mode: "request", logins: ["alice"] }, "CHANGE_PR_REVIEWERS"],
    [{ action: "labels", mode: "remove", names: ["bug"] }, "CHANGE_PR_LABELS"],
    [{ action: "reaction", mode: "add", subjectId: "IC_123", content: "HEART" }, "CHANGE_PR_REACTION"],
  ] as const) {
    const request = (confirm?: string) => ({ input: { method: "inbox.provider.request" }, params: { requestId: "request", item, ...operation, ...(confirm ? { confirm } : {}) }, domainContext: {}, tokenHash: "owner" }) as unknown as Parameters<typeof handleInboxRpc>[1];
    await expect(handleInboxRpc(dependencies, request())).rejects.toThrow("explicit owner action");
    await expect(handleInboxRpc(dependencies, request("CHANGE_PR_STATE"))).rejects.toThrow("explicit owner action");
    await handleInboxRpc(dependencies, request(token));
  }
  expect(enqueue).toHaveBeenCalledTimes(3);
  await handleInboxRpc(dependencies, { input: { method: "inbox.provider.request" }, params: { requestId: "read", item, action: "labels", mode: "list" }, domainContext: {}, tokenHash: "owner" } as unknown as Parameters<typeof handleInboxRpc>[1]);
  expect(enqueue).toHaveBeenCalledTimes(4);
});
