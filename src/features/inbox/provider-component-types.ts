import type { QueryLike } from "@/ui/query-presentation";
import type { ReactNode } from "react";
import type {
  RemoteInboxComment,
  RemoteInboxDetails,
  RemoteInboxItem,
  RemoteInboxList,
  RemoteInboxProvider,
  RemoteInboxProviderState,
  RemoteInboxThread,
} from "../../../../src/features/inbox/model/remoteInbox";
import type { InboxAvailabilityState, InboxCommentParams, InboxOrigin, InboxWriteStatus } from "./provider-protocol";
import type { InboxCommentDraft } from "./provider-state";

export type ProviderInboxBrowseProps = { origin: InboxOrigin; embedded?: boolean };

export type ProviderConnectionsProps = { providers: RemoteInboxProviderState[]; onRetry?: () => void; retrying?: boolean };

export type ProviderInboxFeedbackProps = {
  result: RemoteInboxList;
  onRetry?: () => void;
  retrying?: boolean;
};

export type ProviderInboxRowProps = {
  item: RemoteInboxItem;
  onOpen: (item: RemoteInboxItem) => void;
};

export type ProviderInboxDetailProps = {
  item: RemoteInboxItem;
  origin: InboxOrigin;
  availability: InboxAvailabilityState & QueryLike & { refetch: () => unknown };
  onClose: (notice?: string) => void;
};

export type ProviderInboxDescriptionProps = { details: RemoteInboxDetails };

export type ProviderInboxConversationProps = {
  showBotActivity?: boolean;
  onReaction?: (comment: RemoteInboxComment, mode: "add" | "remove", content: string) => void;
  header?: ReactNode;
  refresh?: () => unknown;
  visible?: boolean;
  provider: RemoteInboxProvider;
  thread: QueryLike & { data?: RemoteInboxThread };
  hideFeedback?: boolean;
  onReply: (comment: RemoteInboxComment) => void;
  disabled: boolean;
  onManageConnections?: () => void;
};

export type ProviderInboxCommentProps = {
  onReaction?: (comment: RemoteInboxComment, mode: "add" | "remove", content: string) => void;
  comment: RemoteInboxComment;
  provider: RemoteInboxProvider;
  onReply: (comment: RemoteInboxComment) => void;
  depth?: number;
  disabled?: boolean;
};

export type ConfirmedInboxComment = {
  draft: InboxCommentDraft;
  params: InboxCommentParams;
};

export type ProviderInboxComposerProps = {
  item: Pick<RemoteInboxItem, "provider" | "title" | "repo" | "number" | "identifier">;
  draft: InboxCommentDraft;
  onChange: (change: Partial<InboxCommentDraft>) => void;
  onConfirm: (comment: ConfirmedInboxComment) => void;
  submission: InboxWriteStatus;
  canSend: boolean;
};
