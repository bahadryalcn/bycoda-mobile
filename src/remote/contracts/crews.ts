import type { HostTask } from "../../../../src/features/tasks/model/hostTasks";
import type { CrewRun } from "../../../../src/features/crews/model/crew";
export type { CrewAgent, CrewCandidate, CrewDefinition, CrewPolicy, CrewRole, CrewRun, SavedCrewAgent } from "../../../../src/features/crews/model/crew";

export type CrewRunView = CrewRun & {
  tasks: HostTask[];
  coordinatorStatus?: "idle" | "running" | "interrupted";
};
export type CrewDirectory = {
  definitions: import("../../../../src/features/crews/model/crew").CrewDefinition[];
  agents: import("../../../../src/features/crews/model/crew").SavedCrewAgent[];
  runs: CrewRunView[];
};

export type CrewPendingInput = {
  taskId: string;
  sessionId: string;
  targetRunId?: string;
  approval?: { requestId: string; decided?: boolean };
  text?: string;
  question?: import("../../features/workspace/wire").UserQuestionPrompt;
};
export type CrewRunDetail = CrewRunView & { pendingInputs: CrewPendingInput[] };
