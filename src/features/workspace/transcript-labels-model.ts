import type { Block } from "./wire";

/** The desktop composer's long-paste attachment (`attachmentPresentation.ts`); shown by its meaning, not its file name. */
export const PASTED_TEXT_FILENAME = "Pasted text.txt";

export function isPastedTextAttachment(file: { name: string; mimeType?: string }) {
  return file.name === PASTED_TEXT_FILENAME && file.mimeType === "text/plain";
}

/**
 * An image block whose generation has not produced an image (desktop `GeneratedImage`): it reads as
 * generating, failed or stopped, never as a broken attachment. A finished image draws normally.
 */
export function pendingImageGeneration(block: Pick<Block, "role" | "image" | "imageGeneration">) {
  if (block.role !== "image" || block.image || !block.imageGeneration) return undefined;
  const { status } = block.imageGeneration;
  return status === "running" || status === "failed" || status === "stopped" ? status : undefined;
}
