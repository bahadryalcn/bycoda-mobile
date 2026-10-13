import type { HostWorktree } from "./host";

export type HostWorktrees = {
  worktrees: HostWorktree[];
  defaultRoot: string;
};

export type HostFileEntry = {
  name: string;
  path: string;
  isDir: boolean;
  ignored: boolean;
};

export type WorkspaceTarget = { projectId: string; cwd?: string };

export type HostGitAction =
  | "stage"
  | "unstage"
  | "stageContents"
  | "stageAll"
  | "unstageAll"
  | "discard"
  | "discardAll"
  | "commit"
  | "push"
  | "createPr";

export type HostBranches = {
  current: string | null;
  branches: string[];
  remotes: { remote: string; name: string }[];
};

export type {
  GitChangedFile,
  GitDiffIndex,
  GitFileDiff,
  GitBranches,
} from "../../../../src/platform/tauri/fs";
export type { ProjectSearchResult } from "../../../../src/features/search/model/search";
