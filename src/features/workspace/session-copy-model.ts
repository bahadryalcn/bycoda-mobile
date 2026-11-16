import type { Block } from "./wire";
import { parseSessionReference } from "./session-reference";

export const MAX_CONVERSATION_TEXT = 256 * 1024;

/** Reject oversized exports instead of silently copying a partial conversation. */
export function conversationText(blocks: readonly Block[]) {
  const parts: string[] = [];
  let size = 0;
  for (const block of blocks) {
    if ((block.role !== "user" && block.role !== "assistant") || block.internal || block.draft || !block.text.trim()) continue;
    if (block.remoteContent) throw new Error("Conversation text is incomplete.");
    const prefix = block.role === "user" ? "User: " : "Assistant: ";
    size += prefix.length + block.text.length + (parts.length ? 2 : 0);
    if (size > MAX_CONVERSATION_TEXT) throw new Error("Conversation exceeds the copy limit.");
    parts.push(prefix + block.text);
  }
  if (!parts.length) throw new Error("No conversation text to copy.");
  return parts.join("\n\n");
}

export function sessionCopyLink(environmentId: string | undefined, sessionId: string) {
  if (!environmentId) return null;
  const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*.~]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const link = `bycoda://session/v1/host/${encode(environmentId)}/${encode(sessionId)}`;
  return parseSessionReference(link) ? link : null;
}
