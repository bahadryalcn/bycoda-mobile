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
};
export type ExistingNoteProps = NoteEditorActions & { id: string };
export type NoteEditorProps = NoteEditorActions & { initial: LocalNoteDraft };
