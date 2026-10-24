import type { NoteComposerCard } from "../../../../src/features/notes/notes";
import { readNoteContext } from "../../../../src/features/notes/noteContext";
import type { BrowserAnnotationCapture } from "../../../../src/shared/lib/browserAnnotation";
export type ComposerTransferScope = { machineId: string; sessionId: string };
export type ComposerTransfer = ComposerTransferScope & { text: string; noteCard?: NoteComposerCard; browserCapture?: { capture: BrowserAnnotationCapture; comment: string; isCurrent: () => boolean } };

/** Append reviewed context without overwriting prose, attachments or mention ownership. */
export function appendComposerTransfer<T extends { text: string; noteCard?: NoteComposerCard }>(draft: T, request: ComposerTransfer,
  scope: ComposerTransferScope, activeMachineId: string | null, available: boolean): T {
  if (!available || activeMachineId !== scope.machineId || request.machineId !== scope.machineId || request.sessionId !== scope.sessionId)
    throw new Error("The destination composer is unavailable. Reopen the selection in the active session.");
  if ((!request.text.trim() && !request.noteCard && !request.browserCapture) || request.text.length > 40_000 || request.text.includes("\0"))
    throw new Error("Select a bounded excerpt before preparing a draft.");
  if (request.noteCard && draft.noteCard) throw new Error("Remove the current note context before adding another.");
  const noteCard = request.noteCard ? readNoteContext(request.noteCard) : undefined;
  const text = draft.text + (request.text && draft.text ? "\n\n" : "") + request.text;
  if (text.length > 256_000) throw new Error("The message is too long.");
  return { ...draft, text, ...(noteCard ? { noteCard } : {}) };
}
