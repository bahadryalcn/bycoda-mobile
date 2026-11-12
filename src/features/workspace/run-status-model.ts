import type { Block } from "@/domain/types";
import { activityState, activityTitle } from "./transcript-model";
import { activeSubagent } from "./subagent-model";

export type RunItem = {
  id: string;
  kind: "subagent" | "tool";
  title: string;
  /** What it is doing right now: the subagent's latest step, or the tool kind. */
  detail?: string;
  agentType?: string;
  startedAt?: number;
  waiting: boolean;
};
export type RunStatus = {
  running: RunItem[];
  subagents: { total: number; running: number; done: number; failed: number };
  tools: number;
  waiting: number;
  /** Earliest start among running items, for the overall elapsed time. */
  startedAt?: number;
};

const squash = (text?: string) => text?.replace(/\s+/g, " ").trim() || undefined;

/** The newest step an active subagent is on, preferring one still running. */
export function subagentNow(block: Block): string | undefined {
  const steps = block.agentRun?.steps ?? [];
  const step = steps.findLast((entry) => entry.status && ["running", "pending", "in_progress"].includes(entry.status)) ?? steps.at(-1);
  return squash(step?.text);
}

/** Only the newest turn can be running; older blocks left "running" by a crash are ignored. */
export function currentTurn(blocks: readonly Block[]): readonly Block[] {
  const start = blocks.findLastIndex((block) => block.role === "user" && !block.internal);
  return start < 0 ? blocks : blocks.slice(start + 1);
}

/** Counts what the session is doing from transcript blocks; empty unless `live`. */
export function runStatus(blocks: readonly Block[], live: boolean): RunStatus {
  const result: RunStatus = { running: [], subagents: { total: 0, running: 0, done: 0, failed: 0 }, tools: 0, waiting: 0 };
  if (!live) return result;
  for (const block of currentTurn(blocks)) {
    if (block.agentRun) {
      const stats = result.subagents;
      stats.total++;
      const state = activityState(block);
      if (state === "failed") stats.failed++;
      else if (state === "completed" || state === "stopped") stats.done++;
      if (!activeSubagent(block) && !(block.approval && !block.approval.decided)) continue;
      const waiting = !!block.approval && !block.approval.decided;
      if (!waiting) stats.running++;
      else result.waiting++;
      result.running.push({ id: block.id, kind: "subagent", title: block.agentRun.name || activityTitle(block), detail: subagentNow(block),
        agentType: block.agentRun.agentType, startedAt: block.agentRun.startedAt, waiting });
      continue;
    }
    if (block.role !== "tool") continue;
    const waiting = !!block.approval && !block.approval.decided;
    if (!waiting && activityState(block) !== "running") continue;
    if (waiting) result.waiting++;
    else result.tools++;
    result.running.push({ id: block.id, kind: "tool", title: activityTitle(block), detail: squash(block.tool?.kind), startedAt: block.startedAt, waiting });
  }
  const starts = result.running.map((item) => item.startedAt).filter((value): value is number => value !== undefined);
  if (starts.length) result.startedAt = Math.min(...starts);
  return result;
}

export const hasRunStatus = (status: RunStatus) => status.running.length > 0 || status.subagents.total > 0;

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600), minutes = Math.floor((total % 3600) / 60), seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
