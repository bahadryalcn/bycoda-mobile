import { restoreQueuedMessages } from "../../../../src/features/sessions/model/queuePersistence";
import {
  sameQueueValue,
  type SharedQueue,
} from "../../../../src/features/connections/model/sharedQueue";
import type { QueuedMessage } from "../../../../src/features/sessions/model/session";

export type QueuedMessageEdit = {
  version: 1;
  original: QueuedMessage;
  text: string;
  owner?: string;
};

export const queueEditConflict =
  "This queued message changed on another computer. Reopen it before editing.";
export const queueEditOwnership =
  "The queue is controlled elsewhere. Reopen the message before editing.";

export function decodeQueuedMessageEdit(raw: string): QueuedMessageEdit {
  const value = JSON.parse(raw) as QueuedMessageEdit;
  const original = restoreQueuedMessages([value?.original])[0];
  if (value?.version !== 1 || typeof value.text !== "string" || !original)
    throw new Error("The saved queued edit could not be read.");
  if (
    value.owner !== undefined &&
    (typeof value.owner !== "string" ||
      !value.owner.startsWith("mobile:") ||
      value.owner.length > 200)
  )
    throw new Error("The saved queued edit could not be read.");
  return { version: 1, original, text: value.text, ...(value.owner ? { owner: value.owner } : {}) };
}

export const encodeQueuedMessageEdit = (value: QueuedMessageEdit | null) =>
  value ? JSON.stringify(value) : null;

/** Edit text alone; attachments, intent, cards and the original model remain intact. */
export function editedQueuedMessage(edit: QueuedMessageEdit): QueuedMessage {
  if (
    !edit.text.trim() &&
    !edit.original.attachments.length &&
    !edit.original.noteCard &&
    !edit.original.handoffCard
  )
    throw new Error("Write a message or keep an attachment before saving.");
  return { ...edit.original, text: edit.text };
}

export function beginQueuedMessageEdit(
  queue: SharedQueue,
  edit: QueuedMessageEdit,
  clientId: string,
): SharedQueue {
  const row = queue.messages.find((value) => value.id === edit.original.id);
  if (!sameQueueValue(row, edit.original)) throw new Error(queueEditConflict);
  if (queue.claim) throw new Error("Wait for the queued send to finish before changing the queue.");
  // A restarted app may explicitly resume its durable draft's prior mobile identity.
  // This never reclaims an unrelated desktop or another mobile editor's marker.
  if (
    queue.editingId &&
    (queue.editingId !== row?.id ||
      (queue.consumer !== clientId && (!edit.owner || queue.consumer !== edit.owner)))
  )
    throw new Error(queueEditOwnership);
  return { ...queue, status: "paused", editingId: edit.original.id };
}

export function saveQueuedMessageEdit(
  queue: SharedQueue,
  edit: QueuedMessageEdit,
  clientId: string,
): SharedQueue {
  if (
    queue.claim ||
    queue.consumer !== clientId ||
    queue.editingId !== edit.original.id ||
    queue.status !== "paused"
  )
    throw new Error(queueEditOwnership);
  const row = queue.messages.find((value) => value.id === edit.original.id);
  const saved = editedQueuedMessage(edit);
  // A response can be lost after the host saved the row. Both states are safe to reconcile.
  if (!sameQueueValue(row, edit.original) && !sameQueueValue(row, saved))
    throw new Error(queueEditConflict);
  return {
    ...queue,
    messages: queue.messages.map((value) => (value.id === saved.id ? saved : value)),
    status: "paused",
    editingId: undefined,
  };
}

export function releaseQueuedMessageEdit(
  queue: SharedQueue,
  id: string,
  clientId: string,
): SharedQueue {
  // A deliberate takeover belongs to its new owner; cancelling cannot pause or clear it.
  return queue.consumer === clientId && queue.editingId === id && !queue.claim
    ? { ...queue, editingId: undefined, status: "paused" }
    : queue;
}

export function queuedEditWasSaved(queue: SharedQueue, edit: QueuedMessageEdit) {
  return sameQueueValue(
    queue.messages.find((value) => value.id === edit.original.id),
    editedQueuedMessage(edit),
  );
}
