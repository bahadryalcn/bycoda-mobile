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
