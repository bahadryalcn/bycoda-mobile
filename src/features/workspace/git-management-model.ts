import type { GitScope } from "./git-types";

export type GitManagementAction = "renameBranch" | "deleteBranch" | "deleteRemoteBranch" | "createTag" | "deleteTag"
  | "addRemote" | "removeRemote" | "merge" | "rebase" | "cherryPick" | "revert" | "reset" | "undoCommit" | "createPr";
export type GitManagementDraft = { action: GitManagementAction; name: string; target: string; remote: string; sha: string;
  mode: "soft" | "mixed" | "hard"; url: string; title: string; body: string; base: string; head: string; force: boolean };
export type GitManagementRow = { kind: "branch" | "tag" | "remote"; name: string; remote?: string; url?: string; current?: boolean };
export type GitManagementSnapshot = { token: string; refs: Record<string, string> };
export type GitManagementIssue = "branchNames" | "chooseBranch" | "remoteBranch" | "tagSha" | "chooseTag" | "remoteUrl" | "chooseRemote"
  | "sourceBranch" | "commitSha" | "resetMode" | "pullRequest" | "snapshotInvalid" | "targetChanged" | "rootUnavailable";
export const gitManagementStateIssues: ReadonlySet<GitManagementIssue> = new Set(["snapshotInvalid", "targetChanged", "rootUnavailable"]);
export class GitManagementIssueError extends Error {
  constructor(readonly issue: GitManagementIssue) { super(issue); this.name = "GitManagementIssueError"; }
}
export function pullRequestRepository(value: unknown): string {
  if (!value || typeof value !== "object") throw new Error("Pull request destination unavailable.");
  const data = value as Record<string, unknown>;
  if (typeof data.url !== "string" || typeof data.nameWithOwner !== "string") throw new Error("Invalid pull request destination.");
  const url = new URL(data.url);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname.replace(/^\//, "").replace(/\/$/, "") !== data.nameWithOwner) throw new Error("Invalid pull request destination.");
  return `${url.host}/${data.nameWithOwner}`;
}
export function safeRemoteUrl(url: string): string {
  return url.replace(/\/\/[^/@\s]*@/g, "//").replace(/[?#].*$/, "");
}
export function managementSnapshotRequest(scope: GitScope, draft: GitManagementDraft, snapshot: GitManagementSnapshot) {
  if (!/^[a-f0-9]{64}$/.test(snapshot.token)) throw new GitManagementIssueError("snapshotInvalid");
  const request = gitManagementRequest(scope, draft);
  let target: string | undefined;
  if (draft.action === "deleteTag") target = snapshot.refs[`refs/tags/${draft.name}`];
  if (draft.action === "deleteRemoteBranch") target = snapshot.refs[`refs/remotes/${draft.remote}/${draft.name}`];
  if (draft.action === "merge" || draft.action === "rebase") target = snapshot.refs[`refs/heads/${draft.target}`] ?? snapshot.refs[`refs/remotes/${draft.target}`];
  if (["deleteTag", "deleteRemoteBranch", "merge", "rebase"].includes(draft.action) && !target) throw new GitManagementIssueError("targetChanged");
  return { ...request, args: { ...request.args, expectedSnapshot: snapshot.token, ...(target ? { expectedTargetSha: target } : {}) } };
}
export function managementDraft(action: GitManagementAction, row?: GitManagementRow): GitManagementDraft {
  return { action, name: row?.name ?? "", target: "", remote: row?.remote ?? "", sha: "", mode: "soft", url: row?.url ?? "",
    title: "", body: "", base: "", head: "", force: false };
}
const bounded = (value: string, max = 255) => !!value.trim() && value.length <= max && !/[\u0000-\u001f]/.test(value);
const ref = (value: string) => bounded(value) && !value.startsWith("-") && !/[\s~^:?*\[\\]/.test(value) && !value.includes("..");
const sha = (value: string) => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value);
/** Keep host argument names explicit; never pass an arbitrary command or shell string. */
export function gitManagementRequest(scope: GitScope, draft: GitManagementDraft) {
  if (!scope.root) throw new GitManagementIssueError("rootUnavailable");
  let command: string;
  let args: Record<string, unknown> = { cwd: scope.root };
  switch (draft.action) {
    case "renameBranch":
      if (!ref(draft.name) || !ref(draft.target) || draft.name === draft.target) throw new GitManagementIssueError("branchNames");
      command = "git_rename_branch"; args = { ...args, from: draft.name, to: draft.target }; break;
    case "deleteBranch":
      if (!ref(draft.name)) throw new GitManagementIssueError("chooseBranch");
      command = "git_delete_branch"; args = { ...args, name: draft.name, force: draft.force }; break;
    case "deleteRemoteBranch":
      if (!ref(draft.name) || !ref(draft.remote)) throw new GitManagementIssueError("remoteBranch");
      command = "git_delete_remote_branch"; args = { ...args, name: draft.name, remote: draft.remote }; break;
    case "createTag":
      if (!ref(draft.name) || !sha(draft.sha)) throw new GitManagementIssueError("tagSha");
      command = "git_create_tag"; args = { ...args, name: draft.name, sha: draft.sha }; break;
    case "deleteTag":
      if (!ref(draft.name)) throw new GitManagementIssueError("chooseTag");
      command = "git_delete_tag"; args = { ...args, name: draft.name }; break;
    case "addRemote":
      if (!ref(draft.name) || !bounded(draft.url, 4096) || draft.url.startsWith("-")) throw new GitManagementIssueError("remoteUrl");
      command = "git_remote_add"; args = { ...args, name: draft.name, url: draft.url.trim() }; break;
    case "removeRemote":
      if (!ref(draft.name)) throw new GitManagementIssueError("chooseRemote");
      command = "git_remote_remove"; args = { ...args, name: draft.name }; break;
    case "merge": case "rebase":
      if (!ref(draft.target)) throw new GitManagementIssueError("sourceBranch");
      command = draft.action === "merge" ? "git_merge" : "git_rebase"; args = { ...args, reference: draft.target }; break;
    case "cherryPick": case "revert": case "reset":
      if (!sha(draft.sha)) throw new GitManagementIssueError("commitSha");
      command = draft.action === "cherryPick" ? "git_cherry_pick" : draft.action === "revert" ? "git_revert" : "git_reset";
      if (draft.action === "reset" && !["soft", "mixed", "hard"].includes(draft.mode)) throw new GitManagementIssueError("resetMode");
      args = { ...args, sha: draft.sha, ...(draft.action === "reset" ? { mode: draft.mode } : {}) }; break;
    case "undoCommit": command = "git_undo_last_commit"; break;
    case "createPr":
      if (!bounded(draft.title, 1000) || draft.body.length > 100000 || !ref(draft.base) || !ref(draft.head)) throw new GitManagementIssueError("pullRequest");
      command = "git_pr_create"; args = { ...args, title: draft.title.trim(), body: draft.body, base: draft.base, head: draft.head }; break;
  }
  return { command, args };
}

export function readGitTags(value: unknown): GitManagementRow[] {
  if (!Array.isArray(value) || value.length > 10000 || value.some((name) => typeof name !== "string" || !bounded(name))) throw new Error("Invalid tag list.");
  return value.map((name) => ({ kind: "tag", name }));
}
export function readGitRemotes(value: unknown): GitManagementRow[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error("Invalid remote list.");
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid remote.");
    const row = item as Record<string, unknown>;
    if (typeof row.name !== "string" || !bounded(row.name) || typeof row.url !== "string" || row.url.length > 4096) throw new Error("Invalid remote.");
    return { kind: "remote", name: row.name, url: row.url };
  });
}
