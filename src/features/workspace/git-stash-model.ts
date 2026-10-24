import type { GitScope } from "./git-types";

export type GitStash = { index: number; sha: string; message: string; timestamp: number };
export type StashMode = "tracked" | "untracked" | "staged";
export type StashOperation =
  | { kind: "create"; mode: StashMode; message: string }
  | { kind: "apply" | "pop" | "drop"; stash: GitStash }
  | { kind: "clear"; stashes: GitStash[] };
const sha = (value: unknown): value is string => typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value);

export function readStashes(value: unknown): GitStash[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error("Invalid or oversized stash list.");
  const indices = new Set<number>();
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid stash entry.");
    const item = entry as Record<string, unknown>;
    if (typeof item.index !== "number" || !Number.isSafeInteger(item.index) || item.index < 0 || indices.has(item.index) ||
      !sha(item.sha) || typeof item.message !== "string" || item.message.length > 10000 ||
      typeof item.timestamp !== "number" || !Number.isFinite(new Date(item.timestamp * 1000).getTime()))
      throw new Error("Invalid stash entry.");
    indices.add(item.index);
    return { index: item.index, sha: item.sha, message: item.message, timestamp: item.timestamp };
  });
}

export function stashRequest(scope: GitScope, operation: StashOperation) {
  if (!scope.root) throw new Error("The checkout root is unavailable.");
  const args: Record<string, unknown> = { cwd: scope.root };
  if (operation.kind === "create") {
    if (!["tracked", "untracked", "staged"].includes(operation.mode) || operation.message.length > 1000 || operation.message.includes("\0"))
      throw new Error("Invalid stash options.");
    return { command: "git_stash", args: { ...args, mode: operation.mode, message: operation.message.trim() } };
  }
  if (operation.kind === "clear") {
    const stashes = readStashes(operation.stashes);
    if (!stashes.length) throw new Error("No stashes selected.");
    return { command: "git_stash_clear", args: { ...args, expectedShas: stashes.map((item) => item.sha) } };
  }
  const [stash] = readStashes([operation.stash]);
  return { command: "git_stash_action", args: { ...args, action: operation.kind, index: stash.index, expectedSha: stash.sha } };
}

export function uncertainStashWrite(error: unknown) {
  return !!error && typeof error === "object" && "uncertain" in error && error.uncertain === true;
}
