import type { RemoteInboxComment } from "../../../../src/features/inbox/model/remoteInbox";

export type InboxConversationRow = { key: string; comment: RemoteInboxComment; depth: number };

/** Replies are list cells too, so a long thread never mounts inside one oversized cell. */
export function inboxConversationRows(comments: readonly RemoteInboxComment[]): InboxConversationRow[] {
  const rows: InboxConversationRow[] = [];
  const pending = comments.map((comment, index) => ({ key: `${index}:${comment.id}`, comment, depth: 0 })).reverse();
  while (pending.length) {
    const row = pending.pop()!;
    rows.push(row);
    const replies = row.comment.replies ?? [];
    for (let index = replies.length - 1; index >= 0; index--) {
      const comment = replies[index]!;
      pending.push({ key: `${row.key}/${index}:${comment.id}`, comment, depth: row.depth + 1 });
    }
  }
  return rows;
}
