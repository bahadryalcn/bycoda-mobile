export const ATTACHMENT_LIMIT = 20 * 1024 * 1024;
export const ATTACHMENT_COUNT = 20;
export type StagedAttachment = { id: string; name: string; mimeType: string; kind: "image" | "audio" | "file"; size: number; uri: string };
export type TransferState = { status: "uploading" | "ready" | "error"; progress: number; error?: unknown };
export function validateAttachment(file: Pick<StagedAttachment, "size" | "name">) {
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > ATTACHMENT_LIMIT) throw new Error("Each attachment must be at most 20 MiB.");
  if (!file.name.trim() || file.name.length > 255) throw new Error("The attachment name is invalid.");
}
export function bytesToBase64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
export function base64ToBytes(text: string): Uint8Array {
  if (text.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error("Invalid attachment data.");
  const decoded = atob(text);
  return Uint8Array.from(decoded, (value) => value.charCodeAt(0));
}
