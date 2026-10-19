import type { UseQueryResult } from "@tanstack/react-query";
import type {
  RemoteInboxAvailability,
  RemoteInboxComment,
  RemoteInboxDetails,
  RemoteInboxItem,
  RemoteInboxList,
  RemoteInboxProvider,
  RemoteInboxProviderState,
  RemoteInboxThread,
} from "../../../../src/features/inbox/model/remoteInbox";
import type { InboxCommentParams, InboxOrigin, InboxWriteStatus } from "./provider-protocol";
import type { InboxCommentDraft } from "./provider-state";

export type ProviderInboxBrowseProps = { origin: InboxOrigin; embedded?: boolean };

export type ProviderConnectionsProps = { providers: RemoteInboxProviderState[] };

export type ProviderInboxItemsProps = {
  result: RemoteInboxList;
  limit: number;
  onOpen: (item: RemoteInboxItem) => void;
  onMore: () => void;
};

export type ProviderInboxDetailProps = {
  item: RemoteInboxItem;
  origin: InboxOrigin;
  availability: UseQueryResult<RemoteInboxAvailability, Error>;
  onClose: (notice?: string) => void;
};

export type ProviderInboxDescriptionProps = { details: RemoteInboxDetails };

export type ProviderInboxConversationProps = {
  provider: RemoteInboxProvider;
  thread: UseQueryResult<RemoteInboxThread, Error>;
  onReply: (comment: RemoteInboxComment) => void;
  disabled: boolean;
};

export type ProviderInboxCommentProps = {
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
  item: Pick<RemoteInboxItem, "provider" | "title">;
  draft: InboxCommentDraft;
  onChange: (change: Partial<InboxCommentDraft>) => void;
  onConfirm: (comment: ConfirmedInboxComment) => void;
  submission: InboxWriteStatus;
  canSend: boolean;
};
