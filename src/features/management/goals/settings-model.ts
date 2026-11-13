import type { GoalSettings, HostGoal } from "@/domain/types";
import { integerInRange } from "../automations/schedule-model";

export function goalSettings(goal: HostGoal): GoalSettings {
  return {
    autoMerge: goal.autoMerge === true,
    continueUntilDone: goal.continueUntilDone === true,
    maxRunningTasks: goal.maxRunningTasks ?? 0,
    maxRunMinutes: goal.maxRunMinutes,
  };
}

export function validGoalSettings(goal: HostGoal, settings: GoalSettings, concurrency: string, minutes: string) {
  return !["done", "cancelled"].includes(goal.status) &&
    integerInRange(concurrency, 0, Number.MAX_SAFE_INTEGER) && integerInRange(minutes, 0, 10_080) &&
    !(settings.autoMerge && goal.isolate === false) &&
    !(goal.status === "planning" && Number(minutes) !== goal.maxRunMinutes);
}
