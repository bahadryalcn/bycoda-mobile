/** Pill height (34) + gap (16) + breathing room, scaled for large system text. */
export function sectionNavigatorClearance(fontScale: number): number {
  return Math.ceil(72 * Math.min(Math.max(fontScale, 1), 2));
}
