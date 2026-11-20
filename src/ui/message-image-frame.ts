/** Inline message images reserve their frame before any pixel loads, so a transcript row never changes height when decoding ends. */
export const IMAGE_FRAME_MAX_HEIGHT = 240;
const MIN_RATIO = 0.6;
const MAX_RATIO = 3;
/** Square placeholder for sources without known dimensions (project files, session attachments, old messages). */
const UNKNOWN_RATIO = 1;

/**
 * Aspect ratio for the reserved frame. Only dimensions already known from trusted local metadata count;
 * a remote or unparsed source never gets measured, because probing it would load it before consent and
 * a late `onLoad` ratio would reflow the transcript. `contentFit="contain"` letterboxes any mismatch.
 */
export function reservedImageRatio(known?: { width: number; height: number } | null): number {
  const width = known?.width;
  const height = known?.height;
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    return UNKNOWN_RATIO;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, width / height));
}
