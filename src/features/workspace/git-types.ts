import type { ReactNode } from "react";
import type { GitChangedFile, GitDiffIndex } from "./wire";
import type { GitConfirmation, GitSelection } from "./workspace-state";

export type GitScope = {
  projectId: string;
  cwd?: string;
  root?: string;
};

export type ProjectGitProps = GitScope & {
  onOpenFile: (path: string) => void;
  onDraftGuard?: (guard: import("./file-editor-types").DraftGuard) => void;
};

export type GitFileAction = "stage" | "unstage" | "stageAll" | "unstageAll";
export type GitConflict = NonNullable<GitDiffIndex["conflicts"]>[number];
export type GitOperation = NonNullable<GitDiffIndex["operation"]>;
export type GitMutationStatus = {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: unknown;
};

export type GitHeaderProps = {
  busy?: boolean;
  index: GitDiffIndex;
  refreshing: boolean;
  onRefresh: () => void;
  onToggleBranches: () => void;
};

export type GitActionFeedbackProps = {
  action: GitMutationStatus;
  extended: GitMutationStatus;
  createBranch: GitMutationStatus;
  switchBranch: GitMutationStatus;
};

export type GitSummaryProps = {
  index: GitDiffIndex;
};

export type GitOperationPanelProps = {
  operation: GitOperation;
  hasConflicts: boolean;
  busy: boolean;
  onChoose: (confirmation: GitConfirmation) => void;
  children?: ReactNode;
};

export type GitConflictsPanelProps = {
  files: GitConflict[];
  canResolve: boolean;
  busy: boolean;
  onOpenFile: (path: string) => void;
  onStageFile: (path: string) => void;
  onChoose: (confirmation: GitConfirmation) => void;
  children?: ReactNode;
};

export type GitBranchesPanelProps = {
  onClose: () => void;
  scope: GitScope;
  name: string;
  onNameChange: (value: string) => void;
  creating: boolean;
  onCreate: () => void;
  onChoose: (confirmation: GitConfirmation) => void;
  children?: ReactNode;
};

export type GitChangesPanelProps = {
  files: GitChangedFile[];
  busy: boolean;
  onSelect: (selection: GitSelection) => void;
  onAction: (action: GitFileAction, path?: string) => void;
};

export type GitCommitPanelProps = {
  busy?: boolean;
  index: GitDiffIndex;
  canRunWorkspace: boolean;
  message: string;
  onMessageChange: (value: string) => void;
  fetching: boolean;
  onFetch: () => void;
  onChoose: (confirmation: GitConfirmation) => void;
  children?: ReactNode;
};

export type GitDiffPanelProps = {
  scope: GitScope;
  selection: GitSelection;
  busy: boolean;
  onBack: () => void;
  onOpenFile: (path: string) => void;
  onStage: (selection: GitSelection) => void;
  onDiscard: (path: string) => void;
  children?: ReactNode;
};

export type GitConfirmationCardProps = {
  confirmation: GitConfirmation;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};
