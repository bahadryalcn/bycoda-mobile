import type { HostGoal, HostTask } from "@/domain/types";

type GoalTask = Pick<HostTask, "id" | "title" | "status">;

/** What an epic card shows about the tasks created from its plan. */
export type GoalTaskView = {
  progress: { done: number; total: number };
  tasks: GoalTask[];
};

const isFinished = (goal: Pick<HostGoal, "status">) =>
  goal.status === "done" || goal.status === "cancelled";

/**
 * The shared task list is only needed for epics that already own tasks, and only
 * needs polling while one of them can still change. Finished epics are read once
 * (and again when the epic record changes, see `stamp`).
 */
export function goalTaskScope(goals: readonly Pick<HostGoal, "status" | "taskIds">[] | undefined): {
  enabled: boolean;
  interval: number | false;
} {
  const owning = goals?.filter((goal) => goal.taskIds.length > 0) ?? [];
  return {
    enabled: owning.length > 0,
    interval: owning.some((goal) => !isFinished(goal)) ? 15_000 : false,
  };
}

/** Changes whenever a task-owning epic is added, removed or updated; search and filters do not affect it. */
export function goalTasksStamp(goals: readonly Pick<HostGoal, "id" | "status" | "taskIds" | "updatedAt">[] | undefined): string {
  return (goals ?? [])
    .filter((goal) => goal.taskIds.length > 0)
    .map((goal) => `${goal.id}:${goal.status}:${goal.updatedAt}`)
    .join("|");
}

/**
 * One pass over the task list, then one lookup per planned task id, instead of
 * filtering the whole list per epic. Tasks follow the plan's order (`taskIds`);
 * ids the host no longer lists count towards `total` but are not shown.
 */
export function goalTaskViews(
  goals: readonly Pick<HostGoal, "id" | "taskIds">[],
  tasks: readonly GoalTask[],
): Map<string, GoalTaskView> {
  const byId = new Map<string, GoalTask>();
  for (const task of tasks) byId.set(task.id, task);
  const views = new Map<string, GoalTaskView>();
  for (const goal of goals) {
    const owned: GoalTask[] = [];
    let done = 0;
    const seen = new Set<string>();
    for (const id of goal.taskIds) {
      const task = byId.get(id);
      if (!task) continue;
      if (task.status === "done") done += 1;
      if (!seen.has(id)) {
        seen.add(id);
        owned.push(task);
      }
    }
    views.set(goal.id, { progress: { done, total: goal.taskIds.length }, tasks: owned });
  }
  return views;
}
