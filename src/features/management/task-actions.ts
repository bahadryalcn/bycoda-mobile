import type { HostTask } from "@/domain/types";
import {
  canEditTask,
  canMoveTask,
  hasUnmergedBranch,
  taskRequiresInstructions,
} from "../../../../src/features/tasks/model/taskRules";

export function taskMatchesFilter(task: HostTask, filter: string) {
  return (
    filter === "all" ||
    (filter === "active"
      ? task.status !== "done"
      : filter === "running"
        ? task.status === "running" || task.status === "verifying"
        : task.status === filter)
  );
}
export function taskActions(task: HostTask) {
  return {
    edit: canEditTask(task.status),
    queue: canMoveTask(task.status, "queued"),
    queueBlocked: !task.prompt.trim() || taskRequiresInstructions(task),
    toDo:
      canMoveTask(task.status, "todo") &&
      (task.status !== "queued" ||
        (!task.sessionId && !task.startedAt && !hasUnmergedBranch(task))),
    stop: canMoveTask(task.status, "blocked"),
    complete:
      canMoveTask(task.status, "done") && (task.status !== "todo" || !hasUnmergedBranch(task)),
  };
}
