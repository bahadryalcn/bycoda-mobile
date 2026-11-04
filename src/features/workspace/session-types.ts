import type {
  Block,
  CommandReceipt,
  HostSession,
  UserQuestionPrompt,
  UserQuestionReply,
} from "./wire";

export type SessionScreenProps = {
  id: string;
  projectId?: string;
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
  onSettings: () => void;
  onRefresh: () => void;
  onCommand: SessionCommand;
};

export type SessionWorkspaceProps = SessionScreenProps & { machineId: string; machineName: string };

export type SessionTranscriptProps = {
  findOpen: boolean;
  onFindOpenChange: (open: boolean) => void;
  navigation?: import("./transcript-scroll").TranscriptScrollPosition;
  view: import("./transcript-model").TranscriptView;
  scope: SessionScope;
  session?: HostSession;
  blocked: boolean;
  command: SessionCommandStatus;
  onCommand: SessionCommand;
  onReceiptHandled: () => void;
};

export type TranscriptBlockProps = {
  parentProvider?: HostSession["session"]["harness"];
  context?: import("@/ui/media-policy").MessageContext;
  responseText?: (id: string) => string | undefined;
  block: Block;
  author?: string;
  scope: SessionScope;
  revision: number;
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
};

export type QuestionDraft = {
  answers: Record<string, string[]>;
  custom: Record<string, string>;
};

export type SessionBlockRequest = {
  scope: SessionScope;
  blockId: string;
  revision: number;
  enabled: boolean;
};
