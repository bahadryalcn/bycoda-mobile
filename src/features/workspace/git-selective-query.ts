import type { HostTransport } from "@/remote/transport";
import type { GitScope } from "./git-types";
import type { GitFileDiff } from "./wire";
import { compareLinesAsync, previewChanges } from "./git-diff-preview";
import { selectiveHunks } from "./git-selective-model";

export function reviewedSnapshot(value: unknown): string {
  const token = (value as { token?: unknown } | null)?.token;
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid repository review snapshot");
  return token;
}
export async function stableGitReview<T>(client: Pick<HostTransport, "request">, scope: GitScope, read: () => Promise<T>, signal?: AbortSignal) {
  if (!scope.root) throw new Error("The checkout root is unavailable");
  const snapshot = () => client.request("workspace.run", { command: "git_management_snapshot", args: { cwd: scope.root } }, { signal }).then(reviewedSnapshot);
  const before = await snapshot(); const value = await read();
  if (before !== await snapshot()) throw new Error("Repository state changed. Reload and review this action again.");
  return { snapshot: before, value };
}
export async function selectiveReview(client: Pick<HostTransport, "request">, scope: GitScope, path: string, signal?: AbortSignal) {
  const review = await stableGitReview(client, scope, async () => {
    const value = await client.request<GitFileDiff>("git.fileDiff", { projectId: scope.projectId, cwd: scope.cwd, path, staged: false }, { signal });
    if (!value || value.relative !== path || typeof value.original !== "string" || typeof value.current !== "string" || value.binary || value.tooLarge) throw new Error("Selective staging requires a complete text diff");
    const changes = await compareLinesAsync(value.original, value.current, { timeout: 120, maxEditLength: 4000 }, signal);
    const preview = previewChanges(changes);
    if (preview.tooLarge || preview.truncated) throw new Error("Selective staging requires a complete text diff");
    return { diff: value, hunks: selectiveHunks(value.original, value.current, changes) };
  }, signal);
  return { snapshot: review.snapshot, ...review.value };
}
export type SelectiveReview = Awaited<ReturnType<typeof selectiveReview>>;
