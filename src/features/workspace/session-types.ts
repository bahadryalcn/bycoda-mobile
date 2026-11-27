import type {
  Block,
  CommandReceipt,
  HostSession,
  UserQuestionPrompt,
  UserQuestionReply,
} from "./wire";

export type SessionScreenProps = {
  id: string;
  layout?: "phone" | "tablet" | "split";
  projectId?: string;
  targetTurnId?: string;
};

export type SessionScope = {
  machineId: string;
  sessionId: string;
};

export type SessionCommand = (params: Record<string, unknown>) => Promise<CommandReceipt>;

export type SessionCommandStatus = {
  isPending: boolean;
  isSuccess: boolean;
  error: unknown;
};

export type SessionQueryStatus = {
  data?: HostSession;
  error: unknown;
  isFetching: boolean;
};

export type QuestionAnswer = (reply: UserQuestionReply) => Promise<unknown>;

export type SessionComposerProps = {
  scope: SessionScope;
  session?: HostSession;
  blocked: boolean;
  busy: boolean;
  onCommand: SessionCommand;
};

export type SessionToolbarProps = {
  scope: SessionScope;
  projectId?: string;
  contextLabel?: string;
  query: SessionQueryStatus;
  command: SessionCommandStatus;
  blocked: boolean;
  onRefresh: () => void;
  onCommand: SessionCommand;
};

export type SessionWorkspaceProps = SessionScreenProps & { machineId: string; machineName: string };

export type SessionTranscriptProps = {
  targetTurnId?: string;
  findOpen: boolean;
  onFindOpenChange: (open: boolean) => void;
  navigation?: import("./transcript-scroll").TranscriptScrollPosition;
  view: import("./transcript-model").TranscriptView;
  scope: SessionScope;
  session?: HostSession;
  blocked: boolean;
  command: SessionCommandStatus;
  /** A Stop for the current run is in flight or awaiting the snapshot; the live row reads "Stopping…". */
  stopping: boolean;
  /** A cancel whose reply was lost; it gets the same status check as `command.error`. */
  stopError?: unknown;
  onCommand: SessionCommand;
  onReceiptHandled: () => void;
  onStopReceiptHandled: () => void;
  /** Re-reads the session now; rejects when the read fails. */
  onRefresh: () => Promise<unknown>;
  /** Measured height of the floating header the list scrolls under; the first row starts below it. */
  topInset?: number;
};

export type TranscriptBlockProps = {
  parentProvider?: HostSession["session"]["harness"];
  context?: import("@/ui/media-policy").MessageContext;
  responseText?: (id: string) => string | undefined;
  block: Block;
  author?: string;
  scope: SessionScope;
  /** Stable getter (identity never changes); read at fetch time so revision bumps do not re-render rows. */
  getRevision: () => number | undefined;
  runId?: string;
  disabled: boolean;
  onCommand: SessionCommand;
  /** An opened activity group already owns disclosure; show its tools directly. */
  activityDetail?: boolean;
};

export type QuestionCardProps = {
  question: UserQuestionPrompt;
  /** Machine/session/run identity for navigation-safe in-memory question state. */
  draftScope?: string;
  /** Authoritative owner revision, including delivery updates coalesced by polling. */
  deliveryVersion?: number;
  disabled: boolean;
  onAnswer: QuestionAnswer;
  initialDraft?: QuestionDraft;
  onDraftChange?: (draft: QuestionDraft) => void;
  /** Text field lost focus: persist any coalesced draft now. */
  onDraftFlush?: () => void;
  attachmentControls?: (questionId: string, held: boolean) => import("react").ReactNode;
  attachments?: Record<string, import("./attachment-model").StagedAttachment[]>;
  attachmentBusy?: boolean;
  submitAnswer?: (reply: UserQuestionReply, draft: QuestionDraft) => Promise<unknown>;
};

export type QuestionDraft = {
  answers: Record<string, string[]>;
  custom: Record<string, string>;
  notes?: Record<string, string>;
  attachments?: Record<string, import("./attachment-model").StagedAttachment[]>;
};

export type SessionBlockRequest = {
  scope: SessionScope;
  blockId: string;
  /** Read inside the query function at fetch time; the Host rejects a stale revision. */
  getRevision: () => number | undefined;
  /** Stable content identity (`remoteContent.digest`); keys the cache when the Host supplies it. */
  digest?: string;
  enabled: boolean;
};
