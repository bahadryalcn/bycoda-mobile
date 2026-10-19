import { ATTACHMENT_COUNT, validateAttachment, type StagedAttachment } from "./attachment-model";
export type SelectedMention = { label: string; path: string };
export type ComposerDraft = { version: 2; text: string; attachments: StagedAttachment[]; selectedMentionRefs: SelectedMention[] };
export const emptyComposerDraft = (): ComposerDraft => ({ version: 2, text: "", attachments: [], selectedMentionRefs: [] });
export function decodeComposerDraft(raw: string): ComposerDraft {
  // Existing v1 keys contain raw prose, including JSON pasted by the owner.
  if (!raw.startsWith("bycoda-composer-v2:\n")) return { ...emptyComposerDraft(), text: raw };
  const value = JSON.parse(raw.slice("bycoda-composer-v2:\n".length)) as ComposerDraft;
  if (typeof value.text !== "string" || !Array.isArray(value.attachments) || value.attachments.length > ATTACHMENT_COUNT || !Array.isArray(value.selectedMentionRefs)) throw new Error("The saved draft could not be read.");
  for (const file of value.attachments) { validateAttachment(file); if (file.claimId !== undefined && (typeof file.claimId !== "string" || !/^[a-f\d-]{36}$/i.test(file.claimId))) throw new Error("The saved attachment claim could not be read."); if (typeof file.uri !== "string" || !file.uri.startsWith("file:") || !/^[a-f\d-]{36}$/i.test(file.id)) throw new Error("The saved attachment could not be read."); }
  return value;
}
export function encodeComposerDraft(value: ComposerDraft | null) { return !value || (!value.text && !value.attachments.length) ? null : `bycoda-composer-v2:\n${JSON.stringify(value)}`; }

/** Ownership metadata can change during upload without changing the user's draft. */
export function sameComposerContent(current: ComposerDraft | null, submitted: ComposerDraft): boolean {
  return !!current && current.text === submitted.text && current.selectedMentionRefs === submitted.selectedMentionRefs &&
    current.attachments.length === submitted.attachments.length && current.attachments.every((file, at) => {
      const before = submitted.attachments[at];
      return before && file.id === before.id && file.uri === before.uri && file.name === before.name &&
        file.size === before.size && file.mimeType === before.mimeType && file.kind === before.kind;
    });
}

export type QueuedComposerDraft = { draft: ComposerDraft; id: string };
/** An ambiguous enqueue retry keeps its request ID across ownership-only edits. */
export function queuedComposerDraft(previous: QueuedComposerDraft | null, draft: ComposerDraft, newId: () => string): QueuedComposerDraft {
  return previous && sameComposerContent(draft, previous.draft) ? previous : { draft, id: newId() };
}
