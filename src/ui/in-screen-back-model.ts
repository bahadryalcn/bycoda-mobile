/** Width of the strip along the leading edge that replaces the native back swipe. */
export const EDGE_BACK_WIDTH = 20;

/**
 * Decides whether a left-edge drag counts as "back". A mostly horizontal drag past a
 * distance, or a short fast flick, completes; vertical scrolling never does.
 */
export function shouldCompleteEdgeBack(drag: { translationX: number; translationY: number; velocityX: number }): boolean {
  if (Math.abs(drag.translationY) > drag.translationX) return false;
  return drag.translationX >= 64 || (drag.translationX >= 24 && drag.velocityX >= 600);
}
