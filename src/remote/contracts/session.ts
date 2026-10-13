import type { HostSession, SessionSyncResponse } from "./host";
/** Legacy hosts still expose these transcript attachments. Keep their wire shape local. */
export interface HtmlArtifactSummary {
  id: string;
  sessionId: string;
  messageId?: string;
  title: string;
  createdAt: string;
  bytes: number;
}
export interface HtmlArtifact extends HtmlArtifactSummary {
  html: string;
}

export type RemoteTranscriptPage = {
  sync: SessionSyncResponse;
  before?: number;
  totalBlocks: number;
  revision: number;
};

export type TranscriptPage = Omit<RemoteTranscriptPage, "sync"> & {
  value: HostSession;
};

export type SessionListResult =
  | { unchanged: true; etag: string }
  | {
      etag: string;
      sessions: import("../../../../src/features/connections/model/protocol").HostSessionSummary[];
    };

export type {
  Block,
  Session,
  RuntimeMode,
  LinkedWorkItem,
} from "../../../../src/features/sessions/model/session";
export type { UserQuestionReply } from "../../../../src/features/sessions/model/userQuestion";
export type { AgentModel } from "../../../../src/features/sessions/model/models";
