import type { LocalNoteDraft } from "./note-drafts";

export type NoteFlow =
  | { kind: "closed" }
  | { kind: "existing"; id: string }
  | { kind: "draft"; initial: LocalNoteDraft };
export type NoteFlowEvent =
  | { type: "close"; expected: NoteFlow }
  | { type: "open"; id: string }
  | { type: "draft"; initial: LocalNoteDraft }
  | { type: "recover"; initial: LocalNoteDraft; expected: NoteFlow };
export const initialNoteFlow: NoteFlow = { kind: "closed" };

/** An async completion belongs to the editor that initiated it, including closed recovery views. */
export function noteFlowReducer(state: NoteFlow, event: NoteFlowEvent): NoteFlow {
  if ((event.type === "close" || event.type === "recover") && event.expected !== state)
    return state;
  if (event.type === "close") return { kind: "closed" };
  return event.type === "open"
    ? { kind: "existing", id: event.id }
    : { kind: "draft", initial: event.initial };
}
