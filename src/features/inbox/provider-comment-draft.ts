import type { RemoteInboxComment, RemoteInboxItem } from "../../../../src/features/inbox/model/remoteInbox";
import type { InboxOrigin } from "./provider-protocol";
import { inboxItemKey } from "./provider-model";
import { emptyInboxCommentDraft, type InboxCommentDraft } from "./provider-state";

/**
 * A comment draft is kept per record on this phone, so closing the record (sheet swipe, native
 * Back, a route change) never discards what was typed. Only the reply's identity and quoted text
 * are stored; its nested replies are not needed to send.
 */
export const inboxCommentDraftKey = (origin: InboxOrigin, item: RemoteInboxItem) =>
  `bycoda.mobile.inbox-comment.v1:${JSON.stringify([origin.machineId, origin.projectId, inboxItemKey(item)])}`;

const text = (value: unknown, limit: number) => typeof value === "string" && value.length <= limit && !value.includes("\0");

/** A malformed or oversized saved value reads as an empty draft rather than blocking the composer. */
export function decodeInboxCommentDraft(raw: string): InboxCommentDraft {
  if (raw.length > 100_000) return emptyInboxCommentDraft;
  let value: { version?: unknown; body?: unknown; reply?: Partial<RemoteInboxComment> | null };
  try { value = JSON.parse(raw); } catch { return emptyInboxCommentDraft; }
  if (!value || value.version !== 1 || !text(value.body, 30_000)) return emptyInboxCommentDraft;
  const reply = value.reply;
  const validReply = !!reply && text(reply.id, 400) && !!reply.id && text(reply.body, 60_000) && text(reply.author, 400) &&
    (reply.threadId === undefined || text(reply.threadId, 400));
  return {
    body: value.body as string,
    reply: validReply ? {
      id: reply.id!, body: reply.body!, author: reply.author!, createdAt: text(reply.createdAt, 100) ? reply.createdAt! : "",
      kind: text(reply.kind, 100) ? reply.kind! : "", url: text(reply.url, 4000) ? reply.url! : "", resolved: reply.resolved === true,
      replies: [], ...(reply.threadId ? { threadId: reply.threadId } : {}),
    } : null,
  };
}

export function encodeInboxCommentDraft(value: InboxCommentDraft | null): string | null {
  if (!value || (!value.body && !value.reply)) return null;
  const reply = value.reply;
  return JSON.stringify({
    version: 1,
    body: value.body,
    reply: reply ? { id: reply.id, body: reply.body, author: reply.author, createdAt: reply.createdAt, kind: reply.kind, url: reply.url,
      resolved: reply.resolved, ...(reply.threadId ? { threadId: reply.threadId } : {}) } : null,
  });
}
