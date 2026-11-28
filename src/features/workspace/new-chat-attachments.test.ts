import { describe, expect, it, vi } from "vitest";
vi.mock("expo-crypto", () => ({ randomUUID: () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }));
import { attachmentOwnerId } from "./attachment-ownership";
import { emptyComposerDraft, type ComposerDraft } from "./composer-draft";
import { exceedsAttachmentCount, uploadCancellable, type StagedAttachment } from "./attachment-model";
import {
  NEW_CHAT_ATTACHMENT_SESSION,
  newChatAttachmentScope,
  newChatAttachmentScopeKey,
  newChatAttachmentsHere,
  newChatAttachmentsSupported,
  newChatDraftAfterSend,
} from "./new-chat-attachments";

const file = (id: string, scope = "pc-1:new:draft"): StagedAttachment => ({
  id,
  name: `${id}.png`,
  mimeType: "image/png",
  kind: "image",
  size: 10,
  uri: `file:///private/chat-drafts/${encodeURIComponent(scope)}/${id}`,
});
const draft = (text: string, attachments: StagedAttachment[]): ComposerDraft => ({ ...emptyComposerDraft(), text, attachments });

describe("new-session attachment scope", () => {
  it("stages per computer under a name no open session can have", () => {
    expect(newChatAttachmentScope("pc-1")).toEqual({ machineId: "pc-1", sessionId: "new:draft" });
    expect(newChatAttachmentScopeKey("pc-1")).toBe("pc-1:new:draft");
    // The Host accepts any bounded owner ID; this one cannot be mistaken for a session's.
    expect(attachmentOwnerId(NEW_CHAT_ATTACHMENT_SESSION)).toBe("mobile:new:draft");
  });

  it("offers attaching only where the create carries a first turn", () => {
    expect(newChatAttachmentsSupported(["sessions.createFirstTurn"])).toBe(true);
    expect(newChatAttachmentsSupported(["attachments.ownership.v1"])).toBe(false);
    expect(newChatAttachmentsSupported(undefined)).toBe(false);
  });

  it("shows and sends only the files picked for the active computer", () => {
    const here = file("a");
    const elsewhere = file("b", "pc-2:new:draft");
    const stagedHere = (entry: StagedAttachment) => entry.uri.includes(encodeURIComponent("pc-1:new:draft"));
    expect(newChatAttachmentsHere([here, elsewhere], stagedHere)).toEqual([here]);
    // An unreadable saved reference is treated as not staged here, never as a crash.
    expect(newChatAttachmentsHere([here], () => { throw new Error("bad uri"); })).toEqual([]);
  });
});

describe("newChatDraftAfterSend", () => {
  it("empties the draft when it still holds exactly what was sent", () => {
    expect(newChatDraftAfterSend(draft("Fix it", [file("a")]), { text: "Fix it", attachmentIds: ["a"] })).toEqual(emptyComposerDraft());
  });

  it("drops delivered files but keeps words changed meanwhile", () => {
    const next = newChatDraftAfterSend(draft("Fix it, then test", [file("a"), file("b")]), { text: "Fix it", attachmentIds: ["a"] });
    expect(next?.text).toBe("Fix it, then test");
    expect(next?.attachments.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("clears the words after an attachment-only send only when nothing was typed meanwhile", () => {
    expect(newChatDraftAfterSend(draft("", [file("a")]), { text: "", attachmentIds: ["a"] })).toEqual(emptyComposerDraft());
    expect(newChatDraftAfterSend(draft("next", [file("a")]), { text: "", attachmentIds: ["a"] })?.text).toBe("next");
  });

  it("keeps files of another computer that were not sent", () => {
    const other = file("b", "pc-2:new:draft");
    expect(newChatDraftAfterSend(draft("Go", [file("a"), other]), { text: "Go", attachmentIds: ["a"] })?.attachments).toEqual([other]);
  });

  it("changes nothing when the draft no longer holds what was sent", () => {
    expect(newChatDraftAfterSend(draft("Other", [file("c")]), { text: "Go", attachmentIds: ["a"] })).toBeUndefined();
  });
});

describe("new session attachment limits and upload cancel", () => {
  it("counts only this computer's staged files toward the 20-file limit", () => {
    const here = Array.from({ length: 5 }, (_, index) => file(`h${index}`));
    const elsewhere = Array.from({ length: 15 }, (_, index) => file(`o${index}`, "pc-2:new:draft"));
    const staged = [...here, ...elsewhere];
    expect(exceedsAttachmentCount(staged, 1)).toBe(true);
    const counted = (entry: StagedAttachment) => entry.uri.includes(encodeURIComponent("pc-1:new:draft"));
    expect(exceedsAttachmentCount(staged, 15, counted)).toBe(false);
    expect(exceedsAttachmentCount(staged, 16, counted)).toBe(true);
  });

  it("offers Cancel upload only while a send owns a moving file", () => {
    expect(uploadCancellable(true, { a: { status: "uploading", progress: 0.5 } })).toBe(true);
    expect(uploadCancellable(true, { a: { status: "ready", progress: 1 } })).toBe(false);
    expect(uploadCancellable(false, { a: { status: "uploading", progress: 0.5 } })).toBe(false);
  });
});
