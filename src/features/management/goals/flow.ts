import type { GoalFlow, GoalFlowEvent } from "./types";

export function goalFlowReducer(_state: GoalFlow, event: GoalFlowEvent): GoalFlow {
  if (event.type === "close") return { kind: "closed" };
  if (event.type === "settings") return { kind: "settings", goal: event.goal };
  return event.type === "new"
    ? { kind: "new", projectId: event.projectId }
    : { kind: "replan", goalId: event.goalId };
}
