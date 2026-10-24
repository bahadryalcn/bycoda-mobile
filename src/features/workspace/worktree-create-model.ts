import type { HostBranches, HostWorktree, WorkspaceTarget } from "@/remote/types";

export type WorktreeCreateScope = WorkspaceTarget & { machineId: string };
export type WorktreeCreateDraft = { branch: string; base: string; existing: boolean };
export function availableWorktreeBranches(branches: HostBranches | undefined, trees: readonly HostWorktree[]) {
  return (branches?.branches ?? []).filter((branch) => !trees.some((tree) => tree.branch === branch));
}
export function worktreeCreateRequest(scope: WorktreeCreateScope, draft: WorktreeCreateDraft, branches: HostBranches, trees: readonly HostWorktree[]) {
  const branch = draft.branch.trim();
  if (!scope.machineId || !scope.projectId || !branch || branch.length > 120 || /^[-@]/.test(branch) || /[\s~^:?*\[\\]/.test(branch) || branch.includes("..") || branch.includes("@{") || branch.endsWith("/") || branch.endsWith(".") || branch.split("/").some((part) => !part || part.startsWith(".") || part.endsWith(".lock")))
    throw new Error("Enter a valid branch name.");
  if (trees.some((tree) => tree.branch === branch)) throw new Error("This branch already has a worktree.");
  if (draft.existing && !branches.branches.includes(branch)) throw new Error("Choose an existing local branch.");
  if (!draft.existing && branches.branches.includes(branch)) throw new Error("This local branch already exists. Choose existing local branch mode.");
  const bases = ["HEAD", ...branches.branches, ...branches.remotes.map((ref) => `${ref.remote}/${ref.name}`)];
  if (!draft.existing && !bases.includes(draft.base)) throw new Error("Choose an available base branch.");
  return { projectId: scope.projectId, ...(scope.cwd ? { cwd: scope.cwd } : {}), branch, base: draft.existing ? "HEAD" : draft.base, existing: draft.existing };
}
export function readCreatedWorktree(value: unknown, expectedBranch?: string): HostWorktree {
  const tree = value as HostWorktree;
  if (!tree || typeof tree.path !== "string" || !tree.path || tree.path.includes("\0") || typeof tree.branch !== "string" || !tree.branch || expectedBranch !== undefined && tree.branch !== expectedBranch || typeof tree.head !== "string" || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(tree.head) || tree.isMain !== false || tree.missing !== false)
    throw Object.assign(new Error("The worktree result is unavailable. Refresh working folders before creating again."), { uncertain: true });
  return tree;
}
export function unknownWorktreeResult(error: unknown) { return (error as { uncertain?: boolean } | null)?.uncertain === true; }
