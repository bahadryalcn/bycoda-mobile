import { expect, it } from "vitest";
import { retainedAttachmentFiles } from "./attachment-retention";
import { emptyComposerDraft } from "./composer-draft";
import { outboxKey } from "../outbox/model/outbox";

it.each(["waiting", "blocked", "dropped", "delivered"])("retains local bytes and claims for %s outbox rows", async status => {
  const id = "8ca190f8-9e1b-477d-9565-2fb1283ac578";
  const attachment = { id, claimId: id, uri: "file:///draft", name: "file", mimeType: "text/plain", kind: "file", size: 1 };
  const rows = [{ id, machineId: "m", sessionId: "s", projectId: "p", environmentId: "e", accountId: "a", createdAt: 1, mode: "send", draft: { ...emptyComposerDraft(), text: "pending", attachments: [attachment] }, command: { sessionId: "s", clientMessageId: id }, model: { harness: "codex", model: "model" }, attempted: false, status }];
  const storage = { getItem: async (key: string) => key === outboxKey("m", "s") ? JSON.stringify(rows) : null, setItem: async () => {} };
  expect(await retainedAttachmentFiles(storage, "m", "s", "e")).toContainEqual(attachment);
});

it("blocks attachment cleanup on a corrupt outbox", async () => {
  const storage = { getItem: async () => "invalid", setItem: async () => {} };
  await expect(retainedAttachmentFiles(storage, "m", "s", "e")).rejects.toThrow();
});

it("retains the phone-wide new-session draft's files staged for this computer only", async () => {
  const { NEW_CHAT_ATTACHMENT_SESSION, NEW_CHAT_DRAFT_KEY } = await import("./new-chat-attachments");
  const { encodeComposerDraft } = await import("./composer-draft");
  const here = "8ca190f8-9e1b-477d-9565-2fb1283ac578", there = "9ca190f8-9e1b-477d-9565-2fb1283ac578";
  const staged = (id: string, scope: string) => ({ id, claimId: id, uri: `file:///docs/chat-drafts/${encodeURIComponent(scope)}/${id}`, name: "f", mimeType: "text/plain", kind: "file" as const, size: 1 });
  const draft = encodeComposerDraft({ ...emptyComposerDraft(), attachments: [staged(here, "m:new:draft"), staged(there, "other:new:draft")] });
  const storage = { getItem: async (key: string) => key === NEW_CHAT_DRAFT_KEY ? draft : null, setItem: async () => {} };
  const ids = (await retainedAttachmentFiles(storage, "m", NEW_CHAT_ATTACHMENT_SESSION, "e")).map((file) => file.id);
  expect(ids).toEqual([here]);
  expect(await retainedAttachmentFiles(storage, "m", "s", "e")).toEqual([]);
});
