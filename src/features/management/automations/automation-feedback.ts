import type { HostAutomation, HostAutomationRun } from "@/domain/types";

/** Save wraps its record in `automation`; list feedback must follow that same target. */
export function savedAutomationId(variables: Record<string, unknown> | undefined): string | undefined {
  const automation = variables?.automation;
  return automation && typeof automation === "object" && "id" in automation && typeof automation.id === "string"
    ? automation.id : undefined;
}

export type AutomationRunSummary = Pick<HostAutomation, "id" | "lastRunAt" | "lastRunStatus" | "lastRunError">;

/** Host finish writes lastRunAt from completedAt. Never merge errors by text alone. */
export function summarizedAutomationRun(
  summary: AutomationRunSummary | undefined,
  runs: readonly HostAutomationRun[],
): string | undefined {
  if (!summary?.lastRunError || !Number.isFinite(summary.lastRunAt)) return undefined;
  const matches = runs.filter((run) =>
    run.automationId === summary.id &&
    run.completedAt === summary.lastRunAt &&
    run.status === summary.lastRunStatus &&
    run.error === summary.lastRunError,
  );
  return matches.length === 1 ? matches[0].id : undefined;
}
