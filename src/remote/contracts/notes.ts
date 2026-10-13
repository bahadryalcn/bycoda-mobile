import type { Note, NoteUpsert } from "../../../../src/features/notes/notes";

export type MobileNote = Note & { slugPending: boolean };

export type MobileNoteList = { notes: (MobileNote & { preview: true })[]; total: number };

export type MobileNoteInput = NoteUpsert;
