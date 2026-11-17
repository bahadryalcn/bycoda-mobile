import { expect, it } from "vitest";
it("retains outbox edit identity through draft storage and rejects malformed identity", () => {
  const draft = { ...emptyComposerDraft(), text: "pending", clientMessageId: "8ca190f8-9e1b-477d-9565-2fb1283ac578" };
  expect(decodeComposerDraft(encodeComposerDraft(draft)!)).toEqual(draft);
  expect(() => decodeComposerDraft(encodeComposerDraft({ ...draft, clientMessageId: "invalid" })!)).toThrow("identity");
});
import {
  decodeComposerDraft,
  emptyComposerDraft,
  encodeComposerDraft,
  sameComposerContent,
  queuedComposerDraft,
  retainQueuedComposerIntent,
} from "./composer-draft";
const attachment = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "file",
  mimeType: "text/plain",
  size: 1,
  kind: "file" as const,
  uri: "file:///draft",
};
it.each([undefined, 2])(
  "persists a pending enqueue with captured generation %s across app reopening and attachment ownership changes",
  (authorityGeneration) => {
    const draft = { ...emptyComposerDraft(), text: "queued intent", attachments: [attachment] };
    const pending = queuedComposerDraft(null, draft, () => "original-id", { authorityGeneration });
    const saved = retainQueuedComposerIntent(draft, pending);
    const reopened = decodeComposerDraft(encodeComposerDraft(saved)!);
    const claimed = {
      ...reopened,
      attachments: [{ ...attachment, claimId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }],
    };
    const recovered = queuedComposerDraft(
      null,
      claimed,
      () => {
        throw new Error("Must retain the existing intent ID");
      },
      { authorityGeneration: 3 },
    );
    expect(recovered.id).toBe("original-id");
    expect(recovered.authorityGeneration).toBe(authorityGeneration);
    expect(Object.hasOwn(recovered, "authorityGeneration")).toBe(true);
    expect(
      queuedComposerDraft(null, { ...reopened, text: "new intent" }, () => "new-id", {
        authorityGeneration: 3,
      }),
    ).toMatchObject({ id: "new-id", authorityGeneration: 3 });
  },
);
it("persists the claim generation without treating it as a new message draft", () => {
  const before = { ...emptyComposerDraft(), text: "send me", attachments: [attachment] };
  const after = {
    ...before,
    attachments: [{ ...attachment, claimId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }],
  };
  expect(decodeComposerDraft(encodeComposerDraft(after)!).attachments[0]?.claimId).toBe(
    after.attachments[0].claimId,
  );
  expect(sameComposerContent(after, before)).toBe(true);
  expect(sameComposerContent({ ...after, text: "newer native edit" }, before)).toBe(false);
  expect(
    sameComposerContent({ ...after, attachments: [...after.attachments, attachment] }, before),
  ).toBe(false);
});
it("continues reading existing local-only drafts without a generation", () => {
  const before = { ...emptyComposerDraft(), attachments: [attachment] };
  expect(decodeComposerDraft(encodeComposerDraft(before)!)).toEqual(before);
});
it("persists the exact reviewed note snapshot even without prose and preserves subsequent drafts", () => {
  const noteCard = {
    id: "note-1",
    slug: "review",
    title: "Reviewed",
    body: "Exact full body\nwith final newline\n",
    sourceCwd: "/project",
  };
  const before = { ...emptyComposerDraft(), noteCard };
  expect(decodeComposerDraft(encodeComposerDraft(before)!)).toEqual(before);
  expect(
    sameComposerContent(
      { ...before, noteCard: { ...noteCard, body: "New reviewed snapshot" } },
      before,
    ),
  ).toBe(false);
  expect(() =>
    decodeComposerDraft(
      `bycoda-composer-v2:\n${JSON.stringify({ ...before, noteCard: { ...noteCard, body: "x".repeat(64_001) } })}`,
    ),
  ).toThrow(/note context/);
  expect(encodeComposerDraft({ ...before, noteCard: undefined })).toBeNull();
});

it("keeps the queued command ID after an ambiguous enqueue and ownership-only retry", () => {
  const draft = { ...emptyComposerDraft(), text: "queue this", attachments: [attachment] };
  const first = queuedComposerDraft(null, draft, () => "first-request");
  const claimed = {
    ...draft,
    attachments: [{ ...attachment, claimId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }],
  };
  expect(queuedComposerDraft(first, claimed, () => "must-not-replay").id).toBe("first-request");
  expect(
    queuedComposerDraft(first, { ...claimed, text: "new command" }, () => "second-request").id,
  ).toBe("second-request");
});
it("round trips the exact untrusted browser metadata and treats a changed snapshot as changed content", () => {
  const browserAnnotation = {
    id: "capture",
    projectId: "project",
    sessionId: "session",
    navigationId: "nav",
    capturedAt: "2026-10-22T00:00:00Z",
    pageUrl: "https://fixture.invalid",
    trust: "untrusted-page-data" as const,
    limitations: [],
    comment: "Owner comment",
    viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0 },
    devicePixelRatio: 1,
    element: {
      tag: "button",
      text: "Page text",
      selector: "#fixture",
      path: "body > button",
      bounds: { x: 1, y: 2, width: 20, height: 30 },
      center: { x: 11, y: 17 },
      ancestry: [],
      computedStyle: {},
    },
  };
  const file = { ...attachment, kind: "image" as const, mimeType: "image/jpeg", browserAnnotation };
  const draft = { ...emptyComposerDraft(), attachments: [file] };
  expect(decodeComposerDraft(encodeComposerDraft(draft)!)).toEqual(draft);
  const changed = {
    ...draft,
    attachments: [{ ...file, browserAnnotation: { ...browserAnnotation, comment: "New comment" } }],
  };
  expect(sameComposerContent(changed, draft)).toBe(false);
  const corrupted = encodeComposerDraft({
    ...draft,
    attachments: [{ ...file, browserAnnotation: { ...browserAnnotation, trust: "trusted" } }],
  } as never)!;
  expect(() => decodeComposerDraft(corrupted)).toThrow();
});
