import type {
  HostFileEntry,
  HostBranches,
  RemoteRequestOptions,
  RemoteTranscriptPage,
  SessionSyncChunk,
} from "@/remote/types";

export type {
  HostProject,
  HostSession,
  HostSessionSummary,
  HostModelCatalog,
  CommandReceipt,
  RemoteProvider,
  SessionSync,
  SessionSyncResponse,
} from "../../../../src/features/connections/model/protocol";
export type { Block, RuntimeMode } from "../../../../src/features/sessions/model/session";
export type {
  UserQuestion,
  UserQuestionPrompt,
  UserQuestionReply,
} from "../../../../src/features/sessions/model/userQuestion";
export type { GitDiffIndex, GitFileDiff, GitChangedFile } from "../../../../src/platform/tauri/fs";

export type FileEntry = HostFileEntry;
export type Branches = HostBranches;
export type RequestOptions = Pick<RemoteRequestOptions, "signal">;
export type SessionPage = RemoteTranscriptPage;
export type SessionChunk = Pick<SessionSyncChunk, "data">;
export type DiffOptions = { timeout?: number; maxEditLength?: number };

export type Requester = {
  request<T>(
    method: string,
    params?: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<T>;
};

export type DiffLine = {
  kind: "same" | "add" | "remove" | "context";
  text: string;
  oldLine?: number;
  newLine?: number;
};

export type DiffPreview = {
  lines: DiffLine[];
  tooLarge: boolean;
  truncated: boolean;
  unchanged: boolean;
};
