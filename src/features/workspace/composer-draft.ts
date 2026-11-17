import { ATTACHMENT_COUNT, validateAttachment, type StagedAttachment } from "./attachment-model";
import type { NoteComposerCard } from "../../../../src/features/notes/notes";
import { readNoteContext } from "../../../../src/features/notes/noteContext";
import { parseBrowserAnnotation } from "../../../../src/shared/lib/browserAnnotation";
import { captureSessionAuthority, type SessionAuthority } from "@/domain/session-authority";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
export type SelectedMention = { label: string; path: string };
type PendingQueueIntent = { id: string; contentDigest: string } & SessionAuthority;
export type ComposerDraft = {
  version: 2;
  text: string;
  attachments: StagedAttachment[];
  selectedMentionRefs: SelectedMention[];
  noteCard?: NoteComposerCard;
  queueIntent?: PendingQueueIntent;
  clientMessageId?: string;
};
export const emptyComposerDraft = (): ComposerDraft => ({
  version: 2,
  text: "",
  attachments: [],
  selectedMentionRefs: [],
});
export function decodeComposerDraft(raw: string): ComposerDraft {
  // Existing v1 keys contain raw prose, including JSON pasted by the owner.
  if (!raw.startsWith("bycoda-composer-v2:\n")) return { ...emptyComposerDraft(), text: raw };
  const value = JSON.parse(raw.slice("bycoda-composer-v2:\n".length)) as ComposerDraft;
  if (value.clientMessageId !== undefined &&
    (typeof value.clientMessageId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.clientMessageId)))
    throw new Error("Saved message identity is invalid.");
  if (
    typeof value.text !== "string" ||
    !Array.isArray(value.attachments) ||
    value.attachments.length > ATTACHMENT_COUNT ||
    !Array.isArray(value.selectedMentionRefs)
  )
    throw new Error("The saved draft could not be read.");
  for (const file of value.attachments) {
    validateAttachment(file);
    if (
      file.claimId !== undefined &&
      (typeof file.claimId !== "string" || !/^[a-f\d-]{36}$/i.test(file.claimId))
    )
      throw new Error("The saved attachment claim could not be read.");
    if (
      typeof file.uri !== "string" ||
      !file.uri.startsWith("file:") ||
      !/^[a-f\d-]{36}$/i.test(file.id)
    )
      throw new Error("The saved attachment could not be read.");
  }
  if (value.noteCard !== undefined) value.noteCard = readNoteContext(value.noteCard);
  if (value.queueIntent !== undefined) {
    const intent = value.queueIntent;
    if (
      !intent ||
      typeof intent.id !== "string" ||
      !intent.id ||
      intent.id.length > 200 ||
      typeof intent.contentDigest !== "string" ||
      !/^[a-f0-9]{64}$/.test(intent.contentDigest)
    )
      throw new Error("The saved queued request could not be read.");
    captureSessionAuthority(intent);
  }
  for (const file of value.attachments)
    if (file.browserAnnotation)
      file.browserAnnotation = parseBrowserAnnotation(file.browserAnnotation);
  return value;
}
export function encodeComposerDraft(value: ComposerDraft | null) {
  return !value ||
    (!value.text && !value.attachments.length && !value.noteCard && !value.queueIntent)
    ? null
    : `bycoda-composer-v2:\n${JSON.stringify(value)}`;
}

/** Ownership metadata can change during upload without changing the user's draft. */
export function sameComposerContent(
  current: ComposerDraft | null,
  submitted: ComposerDraft,
): boolean {
  return (
    !!current &&
    current.text === submitted.text &&
    current.selectedMentionRefs === submitted.selectedMentionRefs &&
    JSON.stringify(current.noteCard) === JSON.stringify(submitted.noteCard) &&
    current.attachments.length === submitted.attachments.length &&
    current.attachments.every((file, at) => {
      const before = submitted.attachments[at];
      return (
        before &&
        file.id === before.id &&
        file.uri === before.uri &&
        file.name === before.name &&
        file.size === before.size &&
        file.mimeType === before.mimeType &&
        file.kind === before.kind &&
        JSON.stringify(file.browserAnnotation) === JSON.stringify(before.browserAnnotation)
      );
    })
  );
}

export type QueuedComposerDraft = { draft: ComposerDraft; id: string } & SessionAuthority;
function queueContentDigest(draft: ComposerDraft): string {
  return bytesToHex(
    sha256(
      utf8ToBytes(
        JSON.stringify({
          text: draft.text,
          mentions: draft.selectedMentionRefs,
          note: draft.noteCard,
          attachments: draft.attachments.map((file) => ({
            id: file.id,
            uri: file.uri,
            name: file.name,
            size: file.size,
            mimeType: file.mimeType,
            kind: file.kind,
            browserAnnotation: file.browserAnnotation,
          })),
        }),
      ),
    ),
  );
}
export function retainQueuedComposerIntent(
  draft: ComposerDraft,
  pending: QueuedComposerDraft,
): ComposerDraft {
  return {
    ...draft,
    queueIntent: {
      id: pending.id,
      contentDigest: queueContentDigest(pending.draft),
      ...captureSessionAuthority(pending),
    },
  };
}
/** An ambiguous enqueue retry keeps its request ID across ownership-only edits. */
export function queuedComposerDraft(
  previous: QueuedComposerDraft | null,
  draft: ComposerDraft,
  newId: () => string,
  displayed: SessionAuthority = {},
): QueuedComposerDraft {
  if (previous && sameComposerContent(draft, previous.draft)) return previous;
  if (draft.queueIntent?.contentDigest === queueContentDigest(draft))
    return { draft, id: draft.queueIntent.id, ...captureSessionAuthority(draft.queueIntent) };
  return { draft, id: newId(), ...captureSessionAuthority(displayed) };
}
