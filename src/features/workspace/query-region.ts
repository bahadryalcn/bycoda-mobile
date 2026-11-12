import { getQueryPresentation, type QueryLike } from "@/ui/query-presentation";

/**
 * True while a query alone should fill the list region (skeleton, no-data error, empty).
 * A paused connection owns the region only while there is no data to show; shown data stays untouched.
 */
export function queryOwnsRegion(query: QueryLike, empty = false) {
  const presentation = getQueryPresentation(query, empty);
  return presentation === "loading" || presentation === "error" || presentation === "empty" ||
    (presentation === "paused" && query.data === undefined);
}
