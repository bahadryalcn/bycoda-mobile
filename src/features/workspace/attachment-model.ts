export const ATTACHMENT_LIMIT = 20 * 1024 * 1024;
export const ATTACHMENT_COUNT = 20;
import { parseBrowserAnnotation, type BrowserAnnotationAttachment } from "../../../../src/shared/lib/browserAnnotation";
export type StagedAttachment = { id: string; name: string; mimeType: string; kind: "image" | "audio" | "file"; size: number; uri: string; claimId?: string; browserAnnotation?: BrowserAnnotationAttachment };
export type TransferState = { status: "uploading" | "ready" | "error"; progress: number; error?: unknown };
/**
 * Whether adding `adding` files passes the per-message limit. `counted` narrows which staged files
 * belong to this message (the phone-wide new-session draft also keeps other computers' files).
 */
export function exceedsAttachmentCount(
  staged: readonly StagedAttachment[],
  adding: number,
  counted: (file: StagedAttachment) => boolean = () => true,
) {
  return staged.filter(counted).length + adding > ATTACHMENT_COUNT;
}
/** A send or retry owns the files and one of them is still moving: the owner may cancel it. */
export const uploadCancellable = (uploading: boolean, transfers: Readonly<Record<string, TransferState>>) =>
  uploading && Object.values(transfers).some((state) => state.status === "uploading");
export function validateAttachment(file: Pick<StagedAttachment, "size" | "name"> & Partial<Pick<StagedAttachment, "browserAnnotation" | "kind" | "mimeType">>) {
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > ATTACHMENT_LIMIT) throw new Error("Each attachment must be at most 20 MiB.");
  if (!file.name.trim() || file.name.length > 255) throw new Error("The attachment name is invalid.");
  if (file.browserAnnotation !== undefined) {
    if (file.kind !== "image" || file.mimeType !== "image/jpeg" || file.size > 2 * 1024 * 1024) throw new Error("Invalid browser attachment");
    parseBrowserAnnotation(file.browserAnnotation);
  }
}
export function bytesToBase64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
export function base64ToBytes(text: string): Uint8Array {
  if (text.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error("Invalid attachment data.");
  const decoded = atob(text);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}
