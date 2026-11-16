import { expect, it } from "vitest";
import type { RemoteInboxComment } from "../../../../src/features/inbox/model/remoteInbox";
import { inboxConversationRows } from "./provider-conversation-model";

const comment = (id: string, replies: RemoteInboxComment[] = []): RemoteInboxComment => ({
  id, author: id, body: `Body ${id}`, createdAt: "2026-11-16T00:00:00Z", replies,
  kind: "comment", url: "https://example.invalid/comment", resolved: false,
});

it("keeps thread reading order, reply targets and depth in independently virtualizable rows", () => {
  const reply = { ...comment("reply", [comment("nested")]), threadId: "original-thread" };
  const root = comment("root", [reply, comment("other")]);
  const rows = inboxConversationRows([root, comment("next")]);
  expect(rows.map(row => [row.comment.id, row.depth])).toEqual([
    ["root", 0], ["reply", 1], ["nested", 2], ["other", 1], ["next", 0],
  ]);
  expect(rows[1]!.comment).toBe(reply);
  expect(rows[1]!.comment.threadId).toBe("original-thread");
  expect(root.replies).toHaveLength(2);
});

it("keeps duplicate provider IDs distinct and handles long reply chains without recursive rendering", () => {
  let thread = comment("same");
  for (let index = 0; index < 1000; index++) thread = comment("same", [thread]);
  const rows = inboxConversationRows([thread, comment("same")]);
  expect(rows).toHaveLength(1002);
  expect(new Set(rows.map(row => row.key)).size).toBe(rows.length);
  expect(inboxConversationRows([])).toEqual([]);
});
