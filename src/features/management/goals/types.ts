import type { useHostMutation } from "@/state/queries";
import type { HostGoal, HostProject } from "@/domain/types";
export type GoalFlow =
  | { kind: "closed" }
  | { kind: "new"; projectId: string }
  | { kind: "replan"; goalId: string };
export type GoalFlowEvent =
  | { type: "new"; projectId: string }
  | { type: "replan"; goalId: string }
  | { type: "close" };
export type GoalEditorProps = {
  projectId: string;
  projects: HostProject[];
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
  busy: boolean;
  editorOpen: boolean;
  onReplan: (goalId: string) => void;
  approve: ReturnType<typeof useHostMutation<HostGoal>>;
  cancel: ReturnType<typeof useHostMutation<HostGoal>>;
  remove: ReturnType<typeof useHostMutation>;
};
