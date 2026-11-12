import type { Block } from "@/domain/types";
import { activityState, activityTitle } from "./transcript-model";
import { subagentNow } from "./run-status-model";

export type AgentEntry = {
  id: string;
  name: string;
  state: ReturnType<typeof activityState>;
  startedAt?: number;
  endedAt?: number;
  /** Agent type and model, e.g. "explorer · gpt-5". */
  meta: string;
  /** What it is doing now, or what it reported when finished. */
  summary?: string;
};

const squash = (text?: string) => text?.replace(/\s+/g, " ").trim() || undefined;

/** Every delegated run in the session, newest first, so the Agents sheet works after the run ends. */
export function listAgents(blocks: readonly Block[] | undefined): AgentEntry[] {
  const entries: AgentEntry[] = [];
  for (const block of blocks ?? []) {
    const run = block.agentRun;
    if (!run) continue;
    const state = activityState(block);
    const report = state === "running" ? undefined : squash(block.tool?.detail);
    entries.push({
      id: block.id,
      name: run.name || activityTitle(block),
      state,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      meta: [run.agentType, run.model?.replace(/^[^:]+:/, "")].filter(Boolean).join(" · "),
      summary: report ?? subagentNow(block),
    });
  }
  return entries.reverse();
}

export const agentCounts = (entries: readonly AgentEntry[]) => ({
  total: entries.length,
  running: entries.filter((entry) => entry.state === "running").length,
});
