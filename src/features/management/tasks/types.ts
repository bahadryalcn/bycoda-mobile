import type { useHostMutation } from "@/state/queries";
import type { HostTask, HostTaskInput, TaskStatus, TaskReviewNote } from "@/domain/types";
export type TaskDraft = HostTaskInput & { status?: TaskStatus; updatedAt?: number };
export type TaskEditorFlow =
  | { kind: "new"; initial: TaskDraft }
  | { kind: "edit"; id: string; projectId: string }
  | null;
export type TaskEditorProps = {
  initial: TaskDraft;
  save: ReturnType<typeof useHostMutation<HostTask>>;
  busy: boolean;
  onClose: () => void;
};
export type ReviewNotesProps = { task: HostTask };
export type ReviewNoteProps = ReviewNotesProps & { note: TaskReviewNote };
export type TaskCardProps = {
  task: HostTask;
  projectName?: string;
  busy: boolean;
  editorOpen: boolean;
  onEdit: (task: HostTask) => void;
  onDelivery: (task: HostTask) => void;
  move: ReturnType<typeof useHostMutation<HostTask>>;
  remove: ReturnType<typeof useHostMutation>;
  decline: ReturnType<typeof useHostMutation>;
  recheck: ReturnType<typeof useHostMutation>;
  finish: ReturnType<typeof useHostMutation<HostTask>>;
  start: ReturnType<typeof useHostMutation<HostTask>>;
  reorder: ReturnType<typeof useHostMutation>;
  tasks: HostTask[];
  lifecycleReady: boolean;
};
