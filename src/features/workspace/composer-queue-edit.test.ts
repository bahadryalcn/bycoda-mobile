import { describe, expect, it } from "vitest";
import {
  mergeQueueChange,
  type SharedQueue,
} from "../../../../src/features/connections/model/sharedQueue";
import {
  beginQueuedMessageEdit,
  decodeQueuedMessageEdit,
  editedQueuedMessage,
  encodeQueuedMessageEdit,
  queuedEditWasSaved,
  releaseQueuedMessageEdit,
  saveQueuedMessageEdit,
  type QueuedMessageEdit,
} from "./composer-queue-edit";

const clientId = "mobile:test";
const makeEdit = (): QueuedMessageEdit => ({
  version: 1,
  original: {
    id: "first",
    text: "Original prompt",
    attachments: [
      {
        id: "a",
        name: "report.pdf",
        mimeType: "application/pdf",
        size: 12,
        kind: "file",
        hostEnvironmentId: "owner",
        path: "/project/report.pdf",
      },
    ],
    modelTarget: { harness: "codex", model: "codex:test", modelSettings: { effort: "medium" } },
    intent: "plan",
  },
  text: "Revised prompt",
});
const queue = (edit = makeEdit()): SharedQueue => ({
  revision: 8,
  status: "paused",
  consumer: clientId,
  editingId: edit.original.id,
  messages: [edit.original, { id: "second", text: "Later", attachments: [] }],
});

describe("queued message editing", () => {
  it("changes only text and preserves original files, model settings, intent and row id", () => {
    const edit = makeEdit();
    const before = queue(edit);
    const result = saveQueuedMessageEdit(before, edit, clientId);
    expect(result.messages[0]).toEqual({ ...edit.original, text: "Revised prompt" });
    expect(result.messages[0]?.attachments).toBe(edit.original.attachments);
    expect(result.messages[0]?.modelTarget).toBe(edit.original.modelTarget);
    expect(result.messages[1]).toBe(before.messages[1]);
    expect(result).toMatchObject({ status: "paused", editingId: undefined });
    expect(before.messages[0]?.text).toBe("Original prompt");
    expect(before.editingId).toBe("first");
  });

  it("pauses explicitly before editing and refuses a changed or removed row", () => {
    const edit = makeEdit();
    const before = {
      ...queue(edit),
      status: "active" as const,
      editingId: undefined,
      consumer: "desktop:owner",
    };
    expect(beginQueuedMessageEdit(before, edit, clientId)).toMatchObject({
      status: "paused",
      editingId: "first",
    });
    expect(before.status).toBe("active");
    for (const messages of [[], [{ ...edit.original, text: "Changed elsewhere" }]]) {
      expect(() => beginQueuedMessageEdit({ ...before, messages }, edit, clientId)).toThrow(
        /changed on another computer/,
      );
      expect(() => saveQueuedMessageEdit({ ...queue(edit), messages }, edit, clientId)).toThrow(
        /changed on another computer/,
      );
    }
  });

  it("blocks fresh ownership loss, active queue, other edit and in-flight send without force saving", () => {
    const edit = makeEdit();
    for (const change of [
      { consumer: "desktop:owner" },
      { status: "active" as const },
      { editingId: "second" },
      { claim: { id: "first", clientId, token: "sending" } },
    ])
      expect(() => saveQueuedMessageEdit({ ...queue(edit), ...change }, edit, clientId)).toThrow(
        /controlled elsewhere/,
      );
    expect(() =>
      beginQueuedMessageEdit({ ...queue(edit), consumer: "desktop:owner" }, edit, clientId),
    ).toThrow(/controlled elsewhere/);
  });

  it("preserves unrelated edits, queue order and appended messages across later revisions", () => {
    const edit = makeEdit();
    const before = queue(edit);
    const after = saveQueuedMessageEdit(before, edit, clientId);
    const current = {
      ...before,
      revision: 12,
      messages: [
        { id: "second", text: "Changed later row", attachments: [] },
        edit.original,
        { id: "third", text: "Added elsewhere", attachments: [] },
      ],
    };
    const merged = mergeQueueChange(current, { before, after });
    expect(merged.messages.map((row) => [row.id, row.text])).toEqual([
      ["second", "Changed later row"],
      ["first", "Revised prompt"],
      ["third", "Added elsewhere"],
    ]);
  });

  it("uses the host row merge to reject send, removal and competing edits after the baseline read", () => {
    const edit = makeEdit();
    const before = queue(edit);
    const after = saveQueuedMessageEdit(before, edit, clientId);
    for (const current of [
      { ...before, claim: { id: "first", clientId: "desktop:owner", token: "sending" } },
      { ...before, messages: before.messages.slice(1) },
      { ...before, messages: [{ ...edit.original, text: "Competing prompt" }] },
    ])
      expect(() => mergeQueueChange(current, { before, after })).toThrow();
  });

  it("recognizes an acknowledged or lost-reply save without duplicating or replacing the row", () => {
    const edit = makeEdit();
    const saved = saveQueuedMessageEdit(queue(edit), edit, clientId);
    expect(queuedEditWasSaved(saved, edit)).toBe(true);
    expect(queuedEditWasSaved(queue(edit), edit)).toBe(false);
    expect(queuedEditWasSaved({ ...saved, messages: [] }, edit)).toBe(false);
    const changedModel = {
      ...editedQueuedMessage(edit),
      modelTarget: { ...edit.original.modelTarget!, model: "other" },
    };
    expect(queuedEditWasSaved({ ...saved, messages: [changedModel] }, edit)).toBe(false);
  });

  it("cancels only its own editing marker and leaves a deliberate takeover intact", () => {
    const before = queue();
    expect(releaseQueuedMessageEdit(before, "first", clientId)).toMatchObject({
      status: "paused",
      editingId: undefined,
    });
    for (const changed of [
      { ...before, consumer: "desktop:owner", status: "active" as const, editingId: undefined },
      { ...before, editingId: "second" },
      { ...before, claim: { id: "first", clientId, token: "sending" } },
    ])
      expect(releaseQueuedMessageEdit(changed, "first", clientId)).toBe(changed);
  });

  it("resumes only the exact previous mobile editor recorded by its durable draft", () => {
    const edit = { ...makeEdit(), owner: "mobile:previous-process" };
    const previous = { ...queue(edit), consumer: edit.owner };
    expect(beginQueuedMessageEdit(previous, edit, clientId)).toMatchObject({
      editingId: "first",
      status: "paused",
    });
    expect(() =>
      beginQueuedMessageEdit({ ...previous, consumer: "mobile:another-device" }, edit, clientId),
    ).toThrow(/controlled elsewhere/);
    expect(() =>
      beginQueuedMessageEdit({ ...previous, consumer: "desktop:owner" }, edit, clientId),
    ).toThrow(/controlled elsewhere/);
    expect(decodeQueuedMessageEdit(encodeQueuedMessageEdit(edit)!)).toEqual(edit);
  });

  it("restores a separate durable edit with original host file references and rejects corrupt data", () => {
    const edit = makeEdit();
    expect(decodeQueuedMessageEdit(encodeQueuedMessageEdit(edit)!)).toEqual(edit);
    expect(encodeQueuedMessageEdit(null)).toBeNull();
    for (const value of [
      "null",
      "{}",
      JSON.stringify({ ...edit, text: null }),
      JSON.stringify({ ...edit, original: null }),
    ])
      expect(() => decodeQueuedMessageEdit(value)).toThrow();
  });

  it("allows a file-only edit, while preventing an empty text-only row", () => {
    const edit = makeEdit();
    edit.text = " ";
    expect(editedQueuedMessage(edit).attachments).toHaveLength(1);
    edit.original.attachments = [];
    expect(() => editedQueuedMessage(edit)).toThrow(/Write a message/);
  });
});
