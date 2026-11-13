import { MAX_MEDIA_BYTES, resolveMediaMime } from "./media-policy";

/** Images and GIFs up to this size load into the transcript without a tap. */
export const INLINE_AUTO_BYTES = 4 * 1024 * 1024;
/** Non-image files above this size ask before downloading. */
export const CONFIRM_DOWNLOAD_BYTES = 1024 * 1024;
/** Copying reads the whole file as base64 into memory, so it is capped. */
export const MAX_COPY_IMAGE_BYTES = 8 * 1024 * 1024;

export type AttachmentKind = "image" | "pdf" | "markdown" | "video" | "file";
export type AttachmentPlan = "inline" | "download" | "too-large";

export function attachmentKind(name: string, mimeType?: string, image = false): AttachmentKind {
  const mime = resolveMediaMime(name, mimeType).split(";", 1)[0]!.trim().toLowerCase();
  if (mime.startsWith("image/") && mime !== "image/svg+xml") return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime === "text/markdown") return "markdown";
  if (mime.startsWith("video/")) return "video";
  return image ? "image" : "file";
}

/** Unknown sizes never auto-load; the Host read path enforces the hard limit anyway. */
export function attachmentPlan(kind: AttachmentKind, size?: number): AttachmentPlan {
  if (size !== undefined && (!Number.isFinite(size) || size < 0 || size > MAX_MEDIA_BYTES)) return "too-large";
  if (kind === "image" && size !== undefined && size <= INLINE_AUTO_BYTES) return "inline";
  return "download";
}

export function downloadNeedsConfirmation(kind: AttachmentKind, size?: number) {
  if (size === undefined) return true;
  return size > (kind === "image" ? INLINE_AUTO_BYTES : CONFIRM_DOWNLOAD_BYTES);
}

export function formatAttachmentSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.ceil(size / 1024))} KB`;
}
