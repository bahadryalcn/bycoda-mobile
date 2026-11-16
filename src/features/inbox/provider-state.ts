import type {
  RemoteInboxComment,
  RemoteInboxItem,
  RemoteInboxProvider,
} from "../../../../src/features/inbox/model/remoteInbox";
import { inboxReplyTarget } from "../../../../src/features/inbox/model/remoteInbox";

export type InboxBrowseState = {
  assigned: boolean;
  all: boolean;
  search: string;
  committedSearch: string;
  selected: RemoteInboxItem | null;
  limit: number;
  notice: string | null;
};
export const initialInboxBrowseState: InboxBrowseState = {
  assigned: false,
  all: false,
  search: "",
  committedSearch: "",
  selected: null,
  limit: 40,
  notice: null,
};
export type InboxBrowseAction =
  | { type: "clear-filters" }
  | { type: "filter"; key: "assigned" | "all"; value: boolean }
  | { type: "search"; value: string }
  | { type: "commit-search"; value: string }
  | { type: "select"; item: RemoteInboxItem }
  | { type: "close"; notice?: string }
  | { type: "more" };
export function inboxBrowseReducer(
  state: InboxBrowseState,
  action: InboxBrowseAction,
): InboxBrowseState {
  switch (action.type) {
    case "clear-filters":
      return { ...state, assigned: false, all: false, search: "", committedSearch: "", selected: null, limit: 40, notice: null };
    case "filter":
      return { ...state, [action.key]: action.value, selected: null, limit: 40, notice: null };
    case "search":
      return { ...state, search: action.value };
    case "commit-search":
      return state.committedSearch === action.value
        ? state
        : { ...state, committedSearch: action.value, selected: null, limit: 40, notice: null };
    case "select":
      return { ...state, selected: action.item, notice: null };
    case "close":
      return { ...state, selected: null, notice: action.notice ?? null };
    case "more":
      return { ...state, limit: state.limit + 40 };
  }
}

export type InboxCommentDraft = { body: string; reply: RemoteInboxComment | null };
export const emptyInboxCommentDraft: InboxCommentDraft = { body: "", reply: null };
/** The owner confirms this fixed text and recipient snapshot. */
export function commentSubmission(provider: RemoteInboxProvider, draft: InboxCommentDraft) {
  const target = draft.reply ? inboxReplyTarget(provider, draft.reply) : undefined;
  return {
    body: draft.body.trim(),
    ...(target ? { inReplyTo: target } : {}),
    confirm: "SEND_COMMENT" as const,
  };
}
export function acknowledgeInboxComment(
  current: InboxCommentDraft,
  submitted: InboxCommentDraft,
): InboxCommentDraft {
  return current === submitted ? emptyInboxCommentDraft : current;
}
