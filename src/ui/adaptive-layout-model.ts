/** A device whose short side reaches this is a tablet (phones in landscape stay below it). */
export const TABLET_MIN_SHORT_SIDE = 600;
/** Window width that fits a persistent list column next to a readable chat. */
export const SPLIT_MIN_WIDTH = 960;
/** Persistent list column width in the split layout. */
export const SPLIT_LIST_WIDTH = 360;

export type AdaptiveLayout = {
  /** Tablet chrome: larger screen, phone navigation may stay (portrait). */
  tablet: boolean;
  /** List and detail side by side, a navigation rail replaces the dock. */
  split: boolean;
};

export function adaptiveLayout(width: number, height: number): AdaptiveLayout {
  const tablet = Math.min(width, height) >= TABLET_MIN_SHORT_SIDE;
  return { tablet, split: tablet && width >= SPLIT_MIN_WIDTH };
}
