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

const CREW_LIVE_POLL_MS = 5000;
const CREW_IDLE_POLL_MS = 15_000;

/** A run can change without owner input while it is active, working, queued, unknown or awaiting an answer. */
function crewRunLive(run: CrewRunView & { pendingInputs?: readonly unknown[] }): boolean {
  return run.status === "active" || crewHasRunningWork(run) || !crewActivityKnown(run)
    || run.tasks.some((task) => task.status === "queued") || !!run.pendingInputs?.length;
}

/** Fast only while the run can change by itself; finished runs stop polling (writes still invalidate). */
export function crewRunPollInterval(run: (CrewRunView & { pendingInputs?: readonly unknown[] }) | undefined): number | false {
  if (!run) return CREW_LIVE_POLL_MS;
  if (crewRunLive(run)) return CREW_LIVE_POLL_MS;
  return run.status === "finished" ? false : CREW_IDLE_POLL_MS;
}

/**
 * Directory polling exists only for the Work list: fast while a run is live, slow otherwise.
 * Definitions, the member library and an open editor never poll (writes and tab entry refetch).
 */
export function crewDirectoryPollInterval(
  directory: { runs: readonly CrewRunView[] } | undefined,
  runsVisible: boolean,
): number | false {
  if (!runsVisible) return false;
  return directory?.runs.some(crewRunLive) ? CREW_LIVE_POLL_MS : CREW_IDLE_POLL_MS;
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
