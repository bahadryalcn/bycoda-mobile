import type { HtmlArtifact, HtmlArtifactSummary } from "@/remote/types";

export const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024;
const MAX_ARTIFACTS = 200;

function utf8Bytes(text: string) {
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes > MAX_ARTIFACT_BYTES) break;
  }
  return bytes;
}

function summary(value: unknown, sessionId: string): HtmlArtifactSummary {
  if (!value || typeof value !== "object") throw new Error("Invalid saved artifact.");
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || !item.id || item.id.length > 512 ||
    item.sessionId !== sessionId || typeof item.title !== "string" || item.title.length > 1000 ||
    typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt)) ||
    typeof item.bytes !== "number" || !Number.isSafeInteger(item.bytes) || item.bytes < 0 ||
    item.bytes > MAX_ARTIFACT_BYTES ||
    (item.messageId !== undefined && typeof item.messageId !== "string")) {
    throw new Error("Invalid saved artifact or artifact exceeds preview limits.");
  }
  return { id: item.id, sessionId, title: item.title, createdAt: item.createdAt,
    bytes: item.bytes, ...(typeof item.messageId === "string" ? { messageId: item.messageId } : {}) };
}

export function readArtifactList(value: unknown, sessionId: string): HtmlArtifactSummary[] {
  if (!Array.isArray(value) || value.length > MAX_ARTIFACTS) throw new Error("Saved artifact list exceeds preview limits.");
  const result = value.map((item) => summary(item, sessionId));
  if (new Set(result.map((item) => item.id)).size !== result.length) throw new Error("Duplicate saved artifact identity.");
  return result;
}

export function readArtifact(value: unknown, sessionId: string, id: string): HtmlArtifact {
  const item = summary(value, sessionId);
  const html = (value as Record<string, unknown>).html;
  if (item.id !== id || typeof html !== "string" || html.length > MAX_ARTIFACT_BYTES ||
    utf8Bytes(html) > MAX_ARTIFACT_BYTES) {
    throw new Error("Invalid saved artifact identity or artifact exceeds preview limits.");
  }
  return { ...item, html };
}
