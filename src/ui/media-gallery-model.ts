/** A horizontal drag past this share of the page width (or a fast flick) turns the page. */
export const PAGE_SWIPE_FRACTION = 0.2;
export const PAGE_SWIPE_VELOCITY = 600;
/** Movement before a one-finger drag commits to paging or to swipe-down dismissal. */
export const AXIS_LOCK_DISTANCE = 8;
/** Past the first or last page the track follows the finger at this rate. */
const EDGE_RESISTANCE = 0.3;

/** What a gallery page shows when its image is not on the device yet. */
export type MediaPageStatus = "loading" | "download" | "too-large" | "failed" | "unavailable";

export const GALLERY_IDLE = 0;
export const GALLERY_PAGE = 1;
export const GALLERY_DISMISS = 2;
export const GALLERY_ZOOM = 3;

export function clampGalleryIndex(index: number, count: number): number {
  "worklet";
  if (count <= 0 || !Number.isFinite(index)) return 0;
  return Math.min(count - 1, Math.max(0, Math.trunc(index)));
}

/** "3 / 7" for a multi-image gallery; a single image shows no counter. */
export function galleryCounter(index: number, count: number): string | null {
  return count > 1 ? `${clampGalleryIndex(index, count) + 1} / ${count}` : null;
}

/** Pages kept mounted: the current one and its neighbours, so a swipe reveals a ready image. */
export function galleryWindow(index: number, count: number): number[] {
  const current = clampGalleryIndex(index, count);
  return count <= 0 ? [] : [current - 1, current, current + 1].filter((value) => value >= 0 && value < count);
}

/**
 * Which gesture a one-finger drag at normal zoom becomes: a mostly horizontal drag pages (when there
 * is more than one image), anything else follows the swipe-down dismissal. Undecided until it moves.
 */
export function galleryAxis(dx: number, dy: number, canPage: boolean): number {
  "worklet";
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) < AXIS_LOCK_DISTANCE) return GALLERY_IDLE;
  return canPage && ax > ay ? GALLERY_PAGE : GALLERY_DISMISS;
}

/** Track offset while paging; the ends resist instead of revealing nothing. */
export function galleryDragOffset(index: number, count: number, dx: number, width: number): number {
  "worklet";
  const atEdge = (index <= 0 && dx > 0) || (index >= count - 1 && dx < 0);
  return -index * width + (atEdge ? dx * EDGE_RESISTANCE : dx);
}

/** Page a released drag settles on: one step at most, never past either end. */
export function settleGalleryPage(index: number, count: number, dx: number, vx: number, width: number): number {
  "worklet";
  const far = width > 0 && Math.abs(dx) > width * PAGE_SWIPE_FRACTION;
  const fast = Math.abs(vx) > PAGE_SWIPE_VELOCITY && Math.sign(vx) === Math.sign(dx);
  if (!far && !fast) return clampGalleryIndex(index, count);
  return clampGalleryIndex(index + (dx < 0 ? 1 : -1), count);
}

/**
 * Whether a message's image may read on its own (within its size plan): a visible tile always; an image
 * hidden behind "+N" only while the open gallery shows it or a neighbour page, so nobody downloads
 * pictures they never look at.
 */
export function mediaAutoLoads(index: number, visibleSlots: number, galleryPage: number | null): boolean {
  if (index < visibleSlots) return true;
  return galleryPage !== null && Math.abs(index - galleryPage) <= 1;
}
