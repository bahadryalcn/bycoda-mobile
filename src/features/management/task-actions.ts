import { canFinishTaskWithFindings } from "../../../../src/shared/model/host-contracts/task-findings";
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
export function taskActions(task: HostTask, capabilities: readonly string[] = []) {
  return {
    finishWithFindings: capabilities.includes("tasks.finish-with-findings") && canFinishTaskWithFindings(task),
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

/** Omission inherits Work policy; zero is an explicit unlimited limit. */
export function taskRunLimitForSave(task: Pick<HostTask, "maxRunMinutes" | "inheritMaxRunMinutes">): number | undefined {
  return task.inheritMaxRunMinutes ? undefined : task.maxRunMinutes;
}
