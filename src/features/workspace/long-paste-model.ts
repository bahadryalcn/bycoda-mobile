import { ATTACHMENT_LIMIT } from "./attachment-model";

/**
 * The desktop composer (`pastedTextAttachment.ts`) keeps a paste of this many characters as a
 * "Pasted text" attachment instead of draft text. A phone field has no paste event, so one edit
 * that inserts this much at once is treated as a paste; typing never inserts that much.
 */
export const LONG_PASTE_MIN_LENGTH = 8_000;

/** The longest draft text a message carries; the rest of a long paste travels as a file. */
export const DRAFT_TEXT_LIMIT = 256_000;

/**
 * The native field's own cap, which cuts silently. It sits past a full draft plus the largest
 * attachment, so a paste the field shortened is too large to attach and is refused with a reason.
 */
export const COMPOSER_FIELD_LIMIT = DRAFT_TEXT_LIMIT + ATTACHMENT_LIMIT + 1;

/**
 * Splits a text-field change into the draft that stays and a long paste to attach. `caret` is the
 * selection start before the change; it anchors the insertion when the pasted text repeats the
 * surrounding draft. Undefined when the change is ordinary editing.
 */
export function takeLongPaste(previous: string, next: string, caret = previous.length) {
  if (next.length < LONG_PASTE_MIN_LENGTH) return undefined;
  const limit = Math.min(previous.length, next.length, Math.max(0, caret));
  let start = 0;
  while (start < limit && previous.charCodeAt(start) === next.charCodeAt(start)) start++;
  let tail = 0;
  const tailLimit = Math.min(previous.length, next.length) - start;
  while (
    tail < tailLimit &&
    previous.charCodeAt(previous.length - 1 - tail) === next.charCodeAt(next.length - 1 - tail)
  )
    tail++;
  const pasted = next.slice(start, next.length - tail);
  if (pasted.length < LONG_PASTE_MIN_LENGTH || !pasted.trim()) return undefined;
  return {
    pasted,
    text: next.slice(0, start) + next.slice(next.length - tail),
    caret: start,
  };
}
