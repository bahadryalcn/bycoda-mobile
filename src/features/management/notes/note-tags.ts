/** Match host/host-notes.ts without silently cutting tag content. */
export function noteTags(raw: string): string[] {
  return [...new Set(raw.split(",").map((tag) =>
    tag.trim().replace(/^#+/, "").replace(/\s+/g, "-").toLowerCase().replace(/-+$/, ""),
  ).filter(Boolean))];
}

export function noteTagIssue(tags: readonly string[]): "count" | "length" | undefined {
  if (tags.some((tag) => Array.from(tag).length > 48)) return "length";
  if (tags.length > 20) return "count";
}

export const NOTE_TITLE_LIMIT = 200;

export function noteTitleTooLong(title: string): boolean {
  return Array.from(title.trim()).length > NOTE_TITLE_LIMIT;
}
