import type { ReactNode } from "react";
import type { useHostMutation } from "@/state/queries";
import type { Note } from "@/domain/types";
import type { MobileNoteList } from "@/remote/types";
import type { LocalNoteDraft, NoteDraftOwner } from "../note-drafts";
export type NoteList = MobileNoteList;
export type NoteSave = ReturnType<typeof useHostMutation<Note>>;
export type NoteRemove = ReturnType<typeof useHostMutation>;
export type NoteEditorActions = {
  save: NoteSave;
  remove: NoteRemove;
  /** Machine-scoped draft store handle; null while no computer is selected. */
  draftOwner: NoteDraftOwner | null;
  onClose: () => void;
  /** Places the open note's status, view toggle and menu in the sheet header (undefined restores Close). */
  setHeader: (header: ReactNode) => void;
  /** Display name of the project a note belongs to, when known. */
  projectLabel?: (cwd?: string) => string | undefined;
  /** Closes this editor and opens the computer's current version of a note. */
  onReopen?: (id: string) => void;
};
export type ExistingNoteProps = NoteEditorActions & { id: string };
export type NoteEditorProps = NoteEditorActions & {
  initial: LocalNoteDraft;
  /** A new note or a recovered phone draft: the computer does not hold this content yet. */
  unsaved?: boolean;
};
