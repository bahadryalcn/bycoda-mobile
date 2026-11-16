/** The page a horizontal offset rests on, clamped to the available pages. */
export function pageAtOffset(offset: number, width: number, count: number) {
  if (width <= 0 || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(offset / width)));
}
