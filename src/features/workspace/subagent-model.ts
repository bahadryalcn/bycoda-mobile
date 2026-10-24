import type { Block } from "@/domain/types";
import type { SessionScope } from "./session-types";
export type SubagentTarget = SessionScope & { blockId: string; callId?: string; runId?: string };
export function subagentTarget(scope: SessionScope, block: Block, runId?: string): SubagentTarget {
  if (!block.agentRun) throw new Error("This block has no delegated run");
  return { ...scope, blockId: block.id, callId: block.tool?.callId, runId };
}
export function activeSubagent(block: Block): boolean {
  return !!block.agentRun && block.agentRun.endedAt === undefined && ["running", "in_progress", "pending"].includes(block.tool?.status ?? "") &&
    !(block.approval && !block.approval.decided);
}
export function subagentStopCommand(target: SubagentTarget, scope: SessionScope, block: Block, runId?: string) {
  if (scope.machineId !== target.machineId || scope.sessionId !== target.sessionId || runId !== target.runId ||
    !target.runId || !target.callId || block.id !== target.blockId || block.tool?.callId !== target.callId || !activeSubagent(block))
    throw new Error("This subagent changed or is no longer running");
  return { type: "stopItem" as const, sessionId: target.sessionId, runId: target.runId,
    blockId: target.blockId, callId: target.callId };
}
export function subagentSteps(block: Block) {
  const report = !activeSubagent(block) ? block.tool?.detail?.trim() : undefined;
  return { report, steps: (block.agentRun?.steps ?? []).filter((step) =>
    !(report && step.kind === "message" && (step.id.endsWith(":report") || step.text.trim() === report))) };
}
