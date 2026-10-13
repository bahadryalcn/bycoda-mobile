import { ATTACHMENT_COUNT, validateAttachment, type StagedAttachment } from "./attachment-model";
export type SelectedMention = { label: string; path: string };
export type ComposerDraft = { version: 2; text: string; attachments: StagedAttachment[]; selectedMentionRefs: SelectedMention[] };
export const emptyComposerDraft = (): ComposerDraft => ({ version: 2, text: "", attachments: [], selectedMentionRefs: [] });
export function decodeComposerDraft(raw: string): ComposerDraft {
  // Existing v1 keys contain raw prose, including JSON pasted by the owner.
  if (!raw.startsWith("bycoda-composer-v2:\n")) return { ...emptyComposerDraft(), text: raw };
  const value = JSON.parse(raw.slice("bycoda-composer-v2:\n".length)) as ComposerDraft;
  if (typeof value.text !== "string" || !Array.isArray(value.attachments) || value.attachments.length > ATTACHMENT_COUNT || !Array.isArray(value.selectedMentionRefs)) throw new Error("The saved draft could not be read.");
  for (const file of value.attachments) { validateAttachment(file); if (typeof file.uri !== "string" || !file.uri.startsWith("file:") || !/^[a-f\d-]{36}$/i.test(file.id)) throw new Error("The saved attachment could not be read."); }
  return value;
}
export function encodeComposerDraft(value: ComposerDraft | null) { return !value || (!value.text && !value.attachments.length) ? null : `bycoda-composer-v2:\n${JSON.stringify(value)}`; }
