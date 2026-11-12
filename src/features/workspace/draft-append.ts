import type { StagedAttachment } from "./attachment-model";
import { composerDraftKey } from "./attachment-ownership";
import type { ComposerDraft } from "./composer-draft";

/** What another screen may add to a session's composer draft. */
export type DraftAppendRequest = {
  /** Prose or a fenced block, joined to the current text by a blank line. */
  text?: string;
  /** A local file (for example a cached image) the composer copies into its own staging folder. */
  file?: { uri: string; name: string; mimeType?: string };
};
export type DraftAppendTarget = { machineId: string; sessionId: string };

const MAX_PENDING = 8;
const listeners = new Map<string, (request: DraftAppendRequest) => void>();
const pending = new Map<string, DraftAppendRequest[]>();

/**
 * Hands a request to the composer that owns the draft. While that composer is not mounted
 * or not ready the request waits in memory and is delivered when it subscribes.
 */
export function appendToDraft(target: DraftAppendTarget, request: DraftAppendRequest) {
  const key = composerDraftKey(target.machineId, target.sessionId);
  const listener = listeners.get(key);
  if (listener) return listener(request);
  pending.set(key, [...(pending.get(key) ?? []), request].slice(-MAX_PENDING));
}

/** The composer calls this once its draft is ready; queued requests are delivered immediately. */
export function subscribeDraftAppend(key: string, listener: (request: DraftAppendRequest) => void) {
  listeners.set(key, listener);
  const queued = pending.get(key) ?? [];
  pending.delete(key);
  for (const request of queued) listener(request);
  return () => { if (listeners.get(key) === listener) listeners.delete(key); };
}

/** A code fence long enough that the body cannot close it. */
export function fencedBlock(body: string, language = "") {
  let fence = "```";
  while (body.includes(fence)) fence += "`";
  return `${fence}${language}\n${body.replace(/\n+$/, "")}\n${fence}`;
}

export function appendDraftText<T extends Pick<ComposerDraft, "text">>(draft: T, text: string): T {
  if (!text.trim()) return draft;
  const next = draft.text + (draft.text ? "\n\n" : "") + text;
  if (next.length > 256_000) throw new Error("The message is too long.");
  return { ...draft, text: next };
}

export function appendDraftAttachment<T extends Pick<ComposerDraft, "attachments">>(draft: T, file: StagedAttachment, limit: number): T {
  if (draft.attachments.length >= limit) throw new Error(`You can attach up to ${limit} files.`);
  return { ...draft, attachments: [...draft.attachments, file] };
}
