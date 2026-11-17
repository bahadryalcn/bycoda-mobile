import type { SystemColorSwatches } from "./swatches";

/** iOS, web and source tools retain the classic palette. Metro selects Android's reader. */
export function readSystemColorSwatches(_dark: boolean): SystemColorSwatches | null {
  return null;
}
