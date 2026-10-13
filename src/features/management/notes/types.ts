import type { useMutation } from "@tanstack/react-query";
import type { useHostMutation } from "@/state/queries";
import type { Note } from "@/domain/types";
import type { MobileNoteList } from "@/remote/types";
import type { LocalNoteDraft } from "../note-drafts";
export type NoteList = MobileNoteList;
export type StorageOperation = { kind: "save" | "clear"; draft: LocalNoteDraft };
export type NoteSave = ReturnType<typeof useHostMutation<Note>>;
export type NoteRemove = ReturnType<typeof useHostMutation>;
export type NoteStorage = ReturnType<typeof useMutation<void, Error, StorageOperation>>;
export type NoteEditorActions = {
  save: NoteSave;
  remove: NoteRemove;
  storage: NoteStorage;
  onClose: () => void;
};
export type ExistingNoteProps = NoteEditorActions & { id: string };
export type NoteEditorProps = NoteEditorActions & { initial: LocalNoteDraft };
