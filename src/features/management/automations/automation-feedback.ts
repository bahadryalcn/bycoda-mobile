import type { HostAutomation, HostAutomationRun } from "@/domain/types";
import { AutomationEditableConfigurationSchema, HostAutomationSchema } from "../../../../../src/shared/model/host-contracts/automations";

const automationSnapshot = HostAutomationSchema.array();

/** A malformed or duplicate row cannot establish the outcome of a write. */
export function savedAutomation(rows: unknown, id: string): HostAutomation | undefined {
  const matches = automationSnapshot.parse(rows).filter((row) => row.id === id);
  if (matches.length > 1) throw new Error("Invalid automation snapshot");
  return matches[0];
}

function editableSignature(input: unknown) {
  const value = AutomationEditableConfigurationSchema.parse(input);
  return JSON.stringify({ ...value, name: value.name.trim(), modelSettings: value.modelSettings ?? {},
    maxRunMinutes: value.maxRunMinutes ?? 0, maxRunsPerDay: value.maxRunsPerDay ?? 0, enabled: value.enabled !== false },
  (_key, entry: unknown) => entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) : entry);
}

export function sameAutomationConfiguration(left: unknown, right: HostAutomation): boolean {
  return editableSignature(left) === editableSignature(right);
}

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
