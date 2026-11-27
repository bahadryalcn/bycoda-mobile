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
  hideDraftWriteWarning?: boolean;
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
  /** Pull request linked to this checkout's session. */
  linkedPr?: { number: number; state: string };
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
  onReview?: (path: string) => void;
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

export type GitCommitPanelProps = {
  index: GitDiffIndex;
  generation?: ReturnType<typeof import("./use-git-commit-generation").useGitCommitGeneration>;
};

export type GitDiffPanelProps = {
  scope: GitScope;
  selection: GitSelection;
  busy: boolean;
  onBack: () => void;
  onOpenFile: (path: string) => void;
  onStage: (selection: GitSelection) => void;
  onDiscard: (path: string) => void;
  onReviewBusy?: (busy: boolean) => void;
  onReviewExit?: (exit: (() => void) | null) => void;
  children?: ReactNode;
};

export type GitConfirmationReviewProps = {
  confirmation: GitConfirmation;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};
