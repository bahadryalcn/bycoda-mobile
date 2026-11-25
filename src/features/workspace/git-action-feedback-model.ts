import type { GitMutationStatus } from "./git-types";

export type GitActionEntry = { key: string; mutation: GitMutationStatus & { submittedAt?: number }; success: string };

/** The running or most recently submitted Git action; older results stay quiet. */
export function latestGitAction(entries: GitActionEntry[]): GitActionEntry | undefined {
  const active = entries.filter(({ mutation }) => mutation.isPending || mutation.isError || mutation.isSuccess || !!mutation.error);
  return active.find(({ mutation }) => mutation.isPending) ??
    active.reduce<GitActionEntry | undefined>((best, entry) =>
      !best || (entry.mutation.submittedAt ?? 0) > (best.mutation.submittedAt ?? 0) ? entry : best, undefined);
}
