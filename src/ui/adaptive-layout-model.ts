/** A device whose short side reaches this is a tablet (phones in landscape stay below it). */
export const TABLET_MIN_SHORT_SIDE = 600;
/** Window width that fits a persistent list column next to a readable chat. */
export const SPLIT_MIN_WIDTH = 960;
/** Persistent list column share of the window width, clamped to a readable range. */
export const SPLIT_LIST_SHARE = 0.32;
export const SPLIT_LIST_MIN_WIDTH = 320;
export const SPLIT_LIST_MAX_WIDTH = 420;
/** A landscape phone this wide gets the labeled, wider dock like a tablet. */
export const WIDE_DOCK_MIN_WIDTH = 700;

/** List column width for a window `width` wide (rail included). */
export function splitListWidth(width: number): number {
  return Math.round(
    Math.min(SPLIT_LIST_MAX_WIDTH, Math.max(SPLIT_LIST_MIN_WIDTH, width * SPLIT_LIST_SHARE)),
  );
}

/** Tablets and landscape large phones get a wider dock with visible labels. */
export function wideDock(width: number, height: number): boolean {
  return (
    Math.min(width, height) >= TABLET_MIN_SHORT_SIDE ||
    (width > height && width >= WIDE_DOCK_MIN_WIDTH)
  );
}
/** Each side of a hinge must fit a usable pane, otherwise the fold is ignored. */
export const FOLD_MIN_PANE = 280;

/** Hinge input in dp, window-relative (from `bycoda-fold`; null on a cover screen, iOS and web). */
export type FoldInput = {
  posture: "flat" | "half-opened";
  orientation: "vertical" | "horizontal";
  hingeBounds: { left: number; top: number; width: number; height: number };
  isSeparating: boolean;
} | null;

export type HingeGap = {
  axis: "vertical" | "horizontal";
  /** Distance from the window's left (vertical) or top (horizontal) edge to the hinge. */
  start: number;
  /** Hinge thickness; content must not draw in `[start, start + size]`. */
  size: number;
};

export type AdaptiveLayout = {
  /** Tablet chrome: larger screen; a navigation rail replaces the dock in every orientation. */
  tablet: boolean;
  /** List and detail side by side (wide windows only). */
  split: boolean;
  /** Set when the split falls exactly on a vertical hinge (book posture). */
  hinge?: HingeGap;
  /** Half-opened horizontal fold: content above the hinge, controls below. */
  tabletop?: HingeGap;
};

export function adaptiveLayout(width: number, height: number, fold?: FoldInput): AdaptiveLayout {
  const tablet = Math.min(width, height) >= TABLET_MIN_SHORT_SIDE;
  const base: AdaptiveLayout = { tablet, split: tablet && width >= SPLIT_MIN_WIDTH };
  if (!fold || !fold.isSeparating) return base;
  const { left, top, width: hw, height: hh } = fold.hingeBounds;
  if (fold.orientation === "vertical") {
    const rest = width - left - hw;
    if (left < FOLD_MIN_PANE || rest < FOLD_MIN_PANE) return base;
    return { tablet: true, split: true, hinge: { axis: "vertical", start: left, size: hw } };
  }
  const below = height - top - hh;
  if (fold.posture !== "half-opened" || top < FOLD_MIN_PANE || below < FOLD_MIN_PANE / 2) return base;
  return { ...base, tabletop: { axis: "horizontal", start: top, size: hh } };
}
