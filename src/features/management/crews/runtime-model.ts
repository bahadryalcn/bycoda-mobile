import type { CrewRunView } from "@/remote/contracts/crews";
import { RemoteHostError } from "@/remote/host-error";

export function crewInputDefinitelyRejected(error: unknown): boolean {
  return error instanceof RemoteHostError && !error.uncertain
    && ["host", "auth", "identity", "unsupported"].includes(error.kind);
}

/** Availability is advisory. The host revalidates review fingerprints and live state. */
export function canAcceptCrewTask(run: CrewRunView, taskId: string): boolean {
  const task = run.tasks.find((entry) => entry.id === taskId);
  return run.status !== "finished" && run.assignments.some((entry) => entry.taskId === taskId)
    && task?.status === "review" && task.verification?.review?.verdict === "pass"
    && !run.messages.some((entry) => entry.taskId === taskId && !entry.resolvedAt);
}

export function canFinishCrewRun(run: CrewRunView): boolean {
  if (run.status === "finished" || run.messages.some((entry) => !entry.resolvedAt)) return false;
  if (run.sourceTaskId && !run.assignments.length) return false;
  if (run.assignments.some((entry) => run.tasks.find((task) => task.id === entry.taskId)?.status !== "done")) return false;
  return run.assignments.length <= 1 || run.assignments.some((entry) => entry.integration
    && run.assignments.every((other) => other.taskId === entry.taskId
      || run.tasks.find((task) => task.id === entry.taskId)?.dependsOn?.includes(other.taskId)));
}
