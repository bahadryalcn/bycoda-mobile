/** Widest a message's media block grows; the user column (85%) caps it first on narrow phones. */
export const MEDIA_GRID_MAX = 280;
/** Hairline seams between tiles; the transcript ground shows through. */
export const MEDIA_GRID_GAP = 2;
export const MEDIA_GRID_RADIUS = 16;
/** Tile edge of the 2×2 grid used for four or more images. */
export const MEDIA_GRID_TILE = 120;
/** The grid shows at most this many tiles; the last one carries "+N" for the rest. */
export const MEDIA_GRID_SLOTS = 4;
const PAIR_HEIGHT = 160;
const TRIO_HEIGHT = 200;
const SINGLE_MIN = 120;
/** A lone tall image (a phone screenshot) may stand taller than the collage is wide. */
export const MEDIA_SINGLE_MAX_HEIGHT = 360;

export type MediaSize = { width: number; height: number };
export type MediaFrame = { index: number; left: number; top: number; width: number; height: number };
/** Absolute tile frames inside a fixed box, so loading, failing and loaded tiles never reflow the transcript. */
export type MediaGridLayout = { width: number; height: number; tiles: MediaFrame[]; overflow: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function mediaGridWidth(available: number) {
  return Number.isFinite(available) ? Math.max(0, Math.floor(Math.min(MEDIA_GRID_MAX, available))) : MEDIA_GRID_MAX;
}

/**
 * One image keeps its natural aspect inside width × 360, so a tall screenshot stands portrait and a wide
 * photo lies landscape; without a known size it gets a fixed 4:3 frame.
 */
export function singleMediaSize(width: number, natural?: MediaSize): MediaSize {
  if (!natural || !(natural.width > 0) || !(natural.height > 0)) return { width, height: Math.round((width * 3) / 4) };
  const scale = Math.min(width / natural.width, MEDIA_SINGLE_MAX_HEIGHT / natural.height);
  return {
    width: clamp(Math.round(natural.width * scale), Math.min(SINGLE_MIN, width), width),
    height: clamp(Math.round(natural.height * scale), SINGLE_MIN, MEDIA_SINGLE_MAX_HEIGHT),
  };
}

/**
 * Natural sizes learned from loaded images, by a caller's stable key, so a remounted single image takes
 * its settled frame at once instead of starting at 4:3 and reflowing again. Bounded; oldest go first.
 */
const naturalSizes = new Map<string, MediaSize>();
const NATURAL_SIZE_LIMIT = 256;

export function rememberedMediaSize(key: string | undefined): MediaSize | undefined {
  return key ? naturalSizes.get(key) : undefined;
}

/** Records a loaded image's size; returns whether it changed what was known. */
export function rememberMediaSize(key: string, size: MediaSize): boolean {
  if (!(size.width > 0) || !(size.height > 0)) return false;
  const known = naturalSizes.get(key);
  if (known && known.width === size.width && known.height === size.height) return false;
  naturalSizes.delete(key);
  naturalSizes.set(key, { width: size.width, height: size.height });
  while (naturalSizes.size > NATURAL_SIZE_LIMIT) naturalSizes.delete(naturalSizes.keys().next().value!);
  return true;
}

/**
 * Collage of a message's images: 1 alone, 2 side by side, 3 as one tall tile beside two stacked,
 * 4+ as a 2×2 grid whose last tile reports how many more images the gallery holds.
 */
export function mediaGridLayout(count: number, available: number, natural?: MediaSize): MediaGridLayout {
  const width = mediaGridWidth(available);
  if (!(count > 0) || width <= 0) return { width: 0, height: 0, tiles: [], overflow: 0 };
  const gap = MEDIA_GRID_GAP;
  const half = Math.floor((width - gap) / 2);
  if (count === 1) {
    const size = singleMediaSize(width, natural);
    return { ...size, tiles: [{ index: 0, left: 0, top: 0, ...size }], overflow: 0 };
  }
  if (count === 2) {
    return {
      width: half * 2 + gap,
      height: PAIR_HEIGHT,
      tiles: [0, 1].map((index) => ({ index, left: index * (half + gap), top: 0, width: half, height: PAIR_HEIGHT })),
      overflow: 0,
    };
  }
  if (count === 3) {
    const upper = Math.floor((TRIO_HEIGHT - gap) / 2);
    return {
      width: half * 2 + gap,
      height: TRIO_HEIGHT,
      tiles: [
        { index: 0, left: 0, top: 0, width: half, height: TRIO_HEIGHT },
        { index: 1, left: half + gap, top: 0, width: half, height: upper },
        { index: 2, left: half + gap, top: upper + gap, width: half, height: TRIO_HEIGHT - upper - gap },
      ],
      overflow: 0,
    };
  }
  const tile = Math.min(MEDIA_GRID_TILE, half);
  return {
    width: tile * 2 + gap,
    height: tile * 2 + gap,
    tiles: [0, 1, 2, 3].map((index) => ({
      index,
      left: (index % 2) * (tile + gap),
      top: Math.floor(index / 2) * (tile + gap),
      width: tile,
      height: tile,
    })),
    overflow: count - MEDIA_GRID_SLOTS,
  };
}
