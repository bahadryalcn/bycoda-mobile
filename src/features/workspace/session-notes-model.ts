import type { Note } from "@/domain/types";

function noteRecord(value: unknown, sessionId: string, preview: boolean): Note {
  if (!value || typeof value !== "object") throw new Error("Invalid session note.");
  const note = value as Note;
  if (typeof note.id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(note.id) ||
      note.sourceSessionId !== sessionId || typeof note.title !== "string" || note.title.length > 1000 ||
      typeof note.body !== "string" || note.body.length > (preview ? 1000 : 2_000_000) ||
      typeof note.slug !== "string" || !Array.isArray(note.tags) || note.tags.length > 20 ||
      note.tags.some((tag) => typeof tag !== "string" || tag.length > 96) ||
      !Number.isFinite(note.createdAt) || !Number.isFinite(note.updatedAt)) throw new Error("Invalid session note.");
  return note;
}

/** Filtering belongs before the host's result limit, never on a truncated project list. */
export function readSessionNotes(value: unknown, sessionId: string): { notes: Note[]; total: number } {
  if (!value || typeof value !== "object") throw new Error("Invalid session notes.");
  const data = value as { notes: unknown[]; total: number };
  if (!Array.isArray(data.notes) || data.notes.length > 500 || !Number.isSafeInteger(data.total) || data.total < data.notes.length)
    throw new Error("Invalid session notes.");
  const notes = data.notes.map((note) => noteRecord(note, sessionId, true));
  if (new Set(notes.map((note) => note.id)).size !== notes.length) throw new Error("Duplicate session note.");
  return { notes, total: data.total };
}

export function readSessionNote(value: unknown, sessionId: string, noteId: string): Note | null {
  if (value === null) return null;
  const note = noteRecord(value, sessionId, false);
  if (note.id !== noteId) throw new Error("The selected note changed.");
  return note;
}
