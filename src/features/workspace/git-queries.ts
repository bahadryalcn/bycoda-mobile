import { useHostQuery } from "@/state/queries";
import type { Branches, GitDiffIndex, GitFileDiff } from "./wire";
import type { GitScope } from "./git-types";
import type { GitSelection } from "./workspace-state";

export function useGitIndex({ projectId, cwd }: GitScope) {
  return useHostQuery<GitDiffIndex>(
    ["git", projectId, cwd],
    "git.index",
    { projectId, cwd },
    { interval: 10_000 },
  );
}

export function useGitBranches({ projectId, cwd }: GitScope) {
  return useHostQuery<Branches>(["branches", projectId, cwd], "git.branches", { projectId, cwd });
}

export function useGitDiff({ projectId, cwd }: GitScope, selection: GitSelection) {
  return useHostQuery<GitFileDiff>(
    ["diff", projectId, cwd, selection.path, selection.staged],
    "git.fileDiff",
    { projectId, cwd, path: selection.path, staged: selection.staged },
  );
}
