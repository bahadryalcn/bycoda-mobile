import type { WorkspaceTarget, ProjectSearchResult } from "@/remote/types";
import type { DraftGuard } from "./file-editor-types";
export type ProjectFilesProps = WorkspaceTarget & {
  root?: string;
  initialPath?: string | null;
  onClearInitialPath?: () => void;
  onDraftGuard?: (guard: DraftGuard) => void;
};
export type FileContentSearch = ProjectSearchResult;
export type CreateFileFormProps = {
  busy: boolean;
  onCreate: (name: string, isDir: boolean) => void;
};
export type CreateFileDraft = { name: string; isDir: boolean };
