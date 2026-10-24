import type { HostTask } from "@/domain/types";
import {
  canEditTask,
  canMoveTask,
  canTakeOverBlockedTask,
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
    queue: canMoveTask(task.status, "queued", task.crewRunId),
    queueBlocked: !task.prompt.trim() || taskRequiresInstructions(task),
    recheck:
      task.status === "blocked" &&
      task.verification?.review?.verdict === "fail" &&
      !!task.sessionId &&
      !canTakeOverBlockedTask(task) &&
      !taskRequiresInstructions(task),
    toDo:
      canMoveTask(task.status, "todo", task.crewRunId) &&
      (task.status !== "queued" ||
        (!task.sessionId && !task.startedAt && !hasUnmergedBranch(task))),
    stop: canMoveTask(task.status, "blocked", task.crewRunId),
    complete:
      canMoveTask(task.status, "done", task.crewRunId) && (task.status !== "todo" || !hasUnmergedBranch(task)),
  };
}
