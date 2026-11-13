import { decodeComposerDraft } from "./composer-draft";
import { decodeQueuedMessageEdit } from "./composer-queue-edit";
import { decodeQuestionAttachments, questionAttachmentKey, questionDraftFiles, retainedQuestionFiles } from "./question-attachment-draft";

type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
type Reference = { id: string; claimId?: string; uri?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Canonical durable custody scan. Every source must decode successfully before cleanup. */
export async function retainedAttachmentFiles(storage: Storage, machineId: string, sessionId: string, environmentId: string): Promise<Reference[]> {
  const files: Reference[] = [];
  const composer = await storage.getItem(`bycoda.mobile.draft.v1:${machineId}:${sessionId}`);
  if (composer !== null) {
    if (!composer.startsWith("bycoda-composer-v2:\n")) throw new Error("Saved attachment draft ownership is unknown.");
    files.push(...decodeComposerDraft(composer).attachments);
  }
  const questions = decodeQuestionAttachments(await storage.getItem(questionAttachmentKey(machineId, sessionId)));
  files.push(...Object.values(questions.entries).flatMap(questionDraftFiles), ...retainedQuestionFiles(storage, machineId, sessionId));
  const queued = await storage.getItem(`bycoda.mobile.queue-edit.v1:${machineId}:${sessionId}`);
  if (queued !== null) {
    const value = JSON.parse(queued);
    if (!Array.isArray(value?.original?.attachments)) throw new Error("Saved queue attachment ownership is unknown.");
    const edit = decodeQueuedMessageEdit(queued);
    if (edit.original.attachments.length !== value.original.attachments.length)
      throw new Error("Saved queue attachment ownership is unknown.");
    files.push(...edit.original.attachments);
  }
  const queue = await storage.getItem(`bycoda.mobile.queue-attachments.v1:${machineId}:${environmentId}:${sessionId}`);
  if (queue !== null) {
    const value = JSON.parse(queue);
    const claims = (values: unknown): values is Reference[] => Array.isArray(values) && values.every(file => file && typeof file.id === "string" && uuid.test(file.id) && typeof file.claimId === "string" && file.claimId.length <= 128);
    if (value?.version !== 1 || typeof value.generation !== "string" || !uuid.test(value.generation) || !claims(value.snapshot) || !claims(value.held) || !claims(value.releasing) ||
      !Array.isArray(value.reserved) || !value.reserved.every((id: unknown) => typeof id === "string" && uuid.test(id)))
      throw new Error("Saved queue attachment ownership is unknown.");
    // Queue owner/claim is distinct. Keep the original mobile claim until custody settles.
    files.push(...[...value.snapshot, ...value.held, ...value.releasing].map(file => ({ id: file.id })), ...value.reserved.map((id: string) => ({ id })));
  }
  if (files.some(file => typeof file.id !== "string" || !uuid.test(file.id) ||
    (file.claimId !== undefined && (typeof file.claimId !== "string" || !uuid.test(file.claimId)))))
    throw new Error("Saved attachment draft ownership is unknown.");
  return files;
}
