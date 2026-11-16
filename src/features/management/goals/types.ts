import type { useHostMutation } from "@/state/queries";
import type { HostGoal, HostProject, HostTask, RemoteProvider } from "@/domain/types";
export type GoalFlow =
  | { kind: "closed" }
  | { kind: "new"; projectId: string }
  | { kind: "settings"; goal: HostGoal }
  | { kind: "replan"; goalId: string };
export type GoalFlowEvent =
  | { type: "new"; projectId: string }
  | { type: "settings"; goal: HostGoal }
  | { type: "replan"; goalId: string }
  | { type: "close" };
export type GoalEditorProps = {
  projectId: string;
  projects: HostProject[];
  providers: RemoteProvider[];
  create: ReturnType<typeof useHostMutation<HostGoal>>;
  busy: boolean;
  onClose: () => void;
};
export type ReplanEditorProps = {
  goalId: string;
  replan: ReturnType<typeof useHostMutation<HostGoal>>;
  busy: boolean;
  onClose: () => void;
};
export type GoalCardProps = {
  goal: HostGoal;
  projects: HostProject[];
  /** Finished/total tasks created from the plan; absent until the task list loads. */
  progress?: { done: number; total: number };
  /** Tasks created from this epic's plan, shown as its children when loaded. */
  tasks?: readonly Pick<HostTask, "id" | "title" | "status">[];
  busy: boolean;
  editorOpen: boolean;
  onReplan: (goalId: string) => void;
  onSettings: (goal: HostGoal) => void;
  approve: ReturnType<typeof useHostMutation<HostGoal>>;
  cancel: ReturnType<typeof useHostMutation<HostGoal>>;
  remove: ReturnType<typeof useHostMutation>;
};
