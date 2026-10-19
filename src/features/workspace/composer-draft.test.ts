import { expect, it } from "vitest";
import { decodeComposerDraft, emptyComposerDraft, encodeComposerDraft, sameComposerContent, queuedComposerDraft } from "./composer-draft";
const attachment = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "file", mimeType: "text/plain", size: 1, kind: "file" as const, uri: "file:///draft" };
it("persists the claim generation without treating it as a new message draft", () => {
  const before = { ...emptyComposerDraft(), text: "send me", attachments: [attachment] };
  const after = { ...before, attachments: [{ ...attachment, claimId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }] };
  expect(decodeComposerDraft(encodeComposerDraft(after)!).attachments[0]?.claimId).toBe(after.attachments[0].claimId);
  expect(sameComposerContent(after, before)).toBe(true);
  expect(sameComposerContent({ ...after, text: "newer native edit" }, before)).toBe(false);
  expect(sameComposerContent({ ...after, attachments: [...after.attachments, attachment] }, before)).toBe(false);
});
it("continues reading existing local-only drafts without a generation", () => {
  const before = { ...emptyComposerDraft(), attachments: [attachment] };
  expect(decodeComposerDraft(encodeComposerDraft(before)!)).toEqual(before);
});

it("keeps the queued command ID after an ambiguous enqueue and ownership-only retry", () => {
  const draft = { ...emptyComposerDraft(), text: "queue this", attachments: [attachment] };
  const first = queuedComposerDraft(null, draft, () => "first-request");
  const claimed = { ...draft, attachments: [{ ...attachment, claimId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }] };
  expect(queuedComposerDraft(first, claimed, () => "must-not-replay").id).toBe("first-request");
  expect(queuedComposerDraft(first, { ...claimed, text: "new command" }, () => "second-request").id).toBe("second-request");
});
