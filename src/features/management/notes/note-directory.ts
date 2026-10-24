import type { Note } from "@/domain/types";
export type NoteGrouping = "none" | "project" | "tag";
export type NoteOrdering = "updated" | "created" | "title";
export type NoteDirectoryRow =
  | { kind: "heading"; key: string; group: string | null; grouping: Exclude<NoteGrouping, "none">; count: number }
  | { kind: "note"; key: string; note: Note };

/** Preview collections remain bounded by the host. A note's content ordering is
 * separate from its optimistic concurrency token. Sorting never mutates either. */
export function noteDirectory(notes: readonly Note[], query: string, grouping: NoteGrouping, ordering: NoteOrdering): NoteDirectoryRow[] {
  const needle = query.trim().toLocaleLowerCase();
  const visible = notes.filter((note) => `${note.title}\n${note.tags.join(" ")}\n${note.sourceCwd ?? ""}`.toLocaleLowerCase().includes(needle));
  const compare = (a: Note, b: Note) => (ordering === "title" ? a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" })
    : ordering === "created" ? b.createdAt - a.createdAt : (b.contentUpdatedAt ?? b.updatedAt) - (a.contentUpdatedAt ?? a.updatedAt)) || a.id.localeCompare(b.id);
  if (grouping === "none") return visible.slice().sort(compare).map((note) => ({ kind: "note", key: note.id, note }));
  const groups = new Map<string | null, Note[]>();
  for (const note of visible) {
    const names = grouping === "project" ? [note.sourceCwd || null] : note.tags.length ? [...new Set(note.tags)] : [null];
    for (const name of names) groups.set(name, [...(groups.get(name) ?? []), note]);
  }
  return [...groups].sort(([a], [b]) => a === null ? 1 : b === null ? -1 : a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .flatMap(([group, members]): NoteDirectoryRow[] => [
      { kind: "heading", key: JSON.stringify(["heading", grouping, group]), group, grouping, count: members.length },
      ...members.sort(compare).map((note): NoteDirectoryRow => ({ kind: "note", key: JSON.stringify([grouping, group, note.id]), note })),
    ]);
}
