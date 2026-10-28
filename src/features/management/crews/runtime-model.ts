import type { CrewRunView } from "@/remote/contracts/crews";
import { RemoteHostError } from "@/remote/host-error";

export function crewInputDefinitelyRejected(error: unknown): boolean {
  return error instanceof RemoteHostError && !error.uncertain
    && ["host", "auth", "identity", "unsupported"].includes(error.kind);
}

export function crewHasRunningWork(run: CrewRunView): boolean {
  return run.coordinatorStatus === "running"
    || run.tasks.some((task) => task.status === "running" || task.status === "verifying");
}

export function crewActivityKnown(run: CrewRunView): boolean {
  return !run.coordinatorSessionId || run.coordinatorStatus !== undefined;
}

export function canStopCrewRun(run: CrewRunView): boolean {
  return run.status !== "finished" && (run.status === "active" || !crewActivityKnown(run) || crewHasRunningWork(run)
    || run.tasks.some((task) => task.status === "queued"));
}

export function canDeleteCrewRun(run: CrewRunView): boolean {
  return run.status !== "active" && crewActivityKnown(run) && !crewHasRunningWork(run)
    && !run.tasks.some((task) => task.status === "queued");
}

export function crewTaskSessions(task: CrewRunView["tasks"][number]) {
  const available = (id: string | undefined) => id?.trim() ? id : undefined;
  const attempts = [...(task.attemptHistory ?? [])].reverse();
  return {
    worker: available(task.sessionId) ?? available(task.blockedTakeover?.previousSessionId)
      ?? attempts.map((entry) => available(entry.workerSessionId)).find(Boolean),
    review: available(task.status === "verifying" ? task.reviewer?.sessionId : undefined)
      ?? available(task.verification?.review?.sessionId) ?? available(task.reviewer?.sessionId)
      ?? attempts.map((entry) => available(entry.reviewerSessionId)).find(Boolean),
  };
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
