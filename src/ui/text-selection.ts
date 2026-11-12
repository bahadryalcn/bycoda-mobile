/**
 * Android ignores `numberOfLines` truncation on selectable text, so a one-line title
 * wraps and overlaps its neighbours. Line-limited text is not selectable unless a
 * caller opts in explicitly with `selectable`.
 */
export function selectableByDefault(numberOfLines: number | undefined): boolean {
  return !numberOfLines;
}
