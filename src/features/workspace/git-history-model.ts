import type { GitScope } from "./git-types";

export type GitHistoryRead =
  | { kind: "history"; limit: number }
  | { kind: "files"; sha: string }
  | { kind: "diff" | "blame"; sha: string; path: string }
  | { kind: "fileHistory"; path: string; limit: number };

/** Commands require the resolved checkout root, never a project id or a guessed path. */
export function gitHistoryRequest(scope: GitScope, read: GitHistoryRead) {
  if (!scope.root) throw new Error("The checkout root is unavailable. Refresh the project.");
  const args: Record<string, unknown> = { cwd: scope.root };
  if ("sha" in read) {
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(read.sha)) throw new Error("Invalid commit revision.");
    args.sha = read.sha;
  }
  if ("path" in read) {
    if (!repositoryPath(read.path))
      throw new Error("Invalid repository-relative file path.");
    args.relative = read.path;
  }
  if ("limit" in read) args.limit = Math.min(500, Math.max(1, Math.trunc(read.limit) || 100));
  const commands = {
    history: "git_history", files: "git_commit_files", diff: "git_commit_file_diff",
    blame: "git_blame", fileHistory: "git_file_history",
  } as const;
  return { command: commands[read.kind], args };
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object";
const sha = (value: unknown) => typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value);
const repositoryPath = (value: unknown) => typeof value === "string" && !!value &&
  !/^(?:[\\/]|[a-z]:)/i.test(value) && !value.split(/[\\/]/).includes("..") && !value.includes("\0");
const timestamp = (value: unknown) => typeof value === "number" && Number.isFinite(value) &&
  Number.isFinite(new Date(value * 1000).getTime());
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const commit = (value: unknown) => record(value) && sha(value.sha) &&
  typeof value.shortSha === "string" && typeof value.subject === "string" &&
  typeof value.author === "string" && timestamp(value.timestamp);

/** Validate fields used by native renderers before data enters their cache. */
export function validateGitHistoryResponse(read: GitHistoryRead, value: unknown): unknown {
  const invalid = () => { throw new Error("The host returned an invalid Git history response."); };
  const list = (value: unknown, max: number, valid: (item: unknown) => boolean) => {
    if (!Array.isArray(value)) return invalid();
    if (value.length > max) throw new Error("Git history exceeds the mobile preview budget. Open this checkout on your computer.");
    if (!value.every(valid)) return invalid();
    return value;
  };
  switch (read.kind) {
    case "history":
      if (!record(value) || (value.head !== null && !sha(value.head))) return invalid();
      list(value.commits, 500, commit);
      return value;
    case "fileHistory": return list(value, 500, commit);
    case "files": return list(value, 5000, (file) => record(file) &&
      repositoryPath(file.relative) && typeof file.status === "string" &&
      count(file.additions) && count(file.deletions));
    case "blame": return list(value, 10000, (line) => record(line) &&
      Number.isSafeInteger(line.line) && typeof line.line === "number" && line.line > 0 &&
      sha(line.sha) && typeof line.shortSha === "string" && typeof line.author === "string" &&
      typeof line.summary === "string" && timestamp(line.timestamp));
    case "diff":
      if (!record(value) || typeof value.original !== "string" || typeof value.current !== "string" || typeof value.status !== "string" ||
          typeof value.binary !== "boolean" || typeof value.tooLarge !== "boolean") return invalid();
      if (value.original.length + value.current.length > 2_000_000)
        throw new Error("Git history exceeds the mobile preview budget. Open this checkout on your computer.");
      return value;
  }
}
