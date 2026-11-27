import { expect, it } from "vitest";
import { decodeInboxCommentDraft, encodeInboxCommentDraft, inboxCommentDraftKey } from "./provider-comment-draft";
import { emptyInboxCommentDraft } from "./provider-state";
import { prRouteFallbackQuery } from "../pull-requests/model/list";

const reply = { id: "c1", threadId: "t1", author: "ada", body: "Quoted", createdAt: "2026-11-01T00:00:00Z", kind: "comment", url: "https://example.invalid/c1", resolved: false,
  replies: [{ id: "nested", body: "x", author: "b", createdAt: "", kind: "", url: "", resolved: false, replies: [] }] };

it("round-trips a reply draft without its nested replies and clears an empty one", () => {
  const encoded = encodeInboxCommentDraft({ body: "Hello", reply });
  expect(decodeInboxCommentDraft(encoded!)).toEqual({ body: "Hello", reply: { ...reply, replies: [] } });
  expect(encodeInboxCommentDraft(emptyInboxCommentDraft)).toBeNull();
  expect(encodeInboxCommentDraft(null)).toBeNull();
});

it("reads malformed or oversized saved values as an empty draft", () => {
  expect(decodeInboxCommentDraft("{")).toBe(emptyInboxCommentDraft);
  expect(decodeInboxCommentDraft(JSON.stringify({ version: 2, body: "x" }))).toBe(emptyInboxCommentDraft);
  expect(decodeInboxCommentDraft("x".repeat(100_001))).toBe(emptyInboxCommentDraft);
  expect(decodeInboxCommentDraft(JSON.stringify({ version: 1, body: "kept", reply: { id: "" } }))).toEqual({ body: "kept", reply: null });
});

it("scopes the draft by computer, project and record", () => {
  const item = { provider: "github", kind: "pr", repo: "o/r", number: 1, projectPath: "/p" } as never;
  expect(inboxCommentDraftKey({ machineId: "m", projectId: "a" }, item)).not.toBe(inboxCommentDraftKey({ machineId: "m", projectId: "b" }, item));
});

it("asks every state in the linked repository when the open list misses a pull request", () => {
  expect(prRouteFallbackQuery({ repo: "owner/repo" })).toEqual({ providers: ["github"], githubKinds: ["pr"], state: "all", assignedToMe: false,
    search: "repo:owner/repo sort:updated-desc" });
});
