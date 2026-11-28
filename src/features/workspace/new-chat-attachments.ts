import { emptyComposerDraft, type ComposerDraft } from "./composer-draft";
import type { StagedAttachment } from "./attachment-model";

/**
 * The attachment owner of the one new-session draft. The session has no ID until its first
 * message creates it, so this name stands in for the session ID wherever attachment staging,
 * upload ownership (`mobile:new:draft`) and claim release expect one. It is never a valid Host
 * session ID, so it cannot collide with an open session's draft.
 */
export const NEW_CHAT_ATTACHMENT_SESSION = "new:draft";

/**
 * The one saved new-session draft on this phone. It is not keyed by computer or project, so the
 * words survive switching either in the hero (and Back or process death); a successful create
 * clears it. The JSON-shaped suffix keeps it out of the per-session `<machine>:<session>` keys
 * the draft presence report reads, while "delete saved drafts" still covers it.
 */
export const NEW_CHAT_DRAFT_KEY = `bycoda.mobile.draft.v1:${JSON.stringify(["new-chat"])}`;

/** Files are staged per computer: an upload checks that the file was picked for that computer. */
export function newChatAttachmentScope(machineId: string) {
  return { machineId, sessionId: NEW_CHAT_ATTACHMENT_SESSION };
}

/** The staging folder key (`<machine>:new:draft`) the shared attachment owners use. */
export function newChatAttachmentScopeKey(machineId: string) {
  return `${machineId}:${NEW_CHAT_ATTACHMENT_SESSION}`;
}

/** An uploaded attachment as the first turn carries it: the Host never sees phone paths or claims. */
export type NewChatAttachmentReference = Omit<StagedAttachment, "uri" | "claimId">;

/**
 * Attaching on a new session needs the first turn to carry the files: an older Host without
 * `sessions.createFirstTurn` leaves the words in the new session's composer instead.
 */
export function newChatAttachmentsSupported(capabilities: readonly string[] | undefined) {
  return !!capabilities?.includes("sessions.createFirstTurn");
}

/**
 * The draft is phone-wide but staged files belong to the computer they were picked for; only
 * those are shown and sent. The others stay saved and return when that computer is active again.
 */
export function newChatAttachmentsHere(
  attachments: readonly StagedAttachment[],
  stagedHere: (file: StagedAttachment) => boolean,
): StagedAttachment[] {
  return attachments.filter((file) => {
    try {
      return stagedHere(file);
    } catch {
      return false;
    }
  });
}

/**
 * The draft after a create carried `sent`: delivered attachments leave it, and its words are
 * cleared only while they are still the words that were sent. Undefined means nothing changes.
 */
export function newChatDraftAfterSend(
  current: ComposerDraft,
  sent: { text: string; attachmentIds: readonly string[] },
): ComposerDraft | undefined {
  const textSent = !!sent.text && current.text.trim() === sent.text;
  const attachments = current.attachments.filter((file) => !sent.attachmentIds.includes(file.id));
  const removed = attachments.length !== current.attachments.length;
  if (!textSent && !removed) return undefined;
  const text = textSent ? "" : current.text;
  if (!text && !attachments.length) return emptyComposerDraft();
  return { ...current, text, attachments };
}

/**
 * Whether a staged file's private copy sits in `scope`'s staging folder (`chat-drafts/<scope>/<id>`),
 * read from its URI alone so custody scans need no file system.
 */
export function stagedInScope(file: { id: string; uri?: string }, scope: string) {
  return !!file.uri && file.uri.replace(/\/+$/, "").endsWith(`/chat-drafts/${encodeURIComponent(scope)}/${file.id}`);
}
