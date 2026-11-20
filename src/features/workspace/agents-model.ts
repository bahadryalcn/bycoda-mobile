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
  workflow?: { callId: string; phase?: string };
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
      ...(run.workflow ? { workflow: run.workflow } : {}),
    });
  }
  return entries.reverse();
}

export type AgentListItem =
  | { kind: "heading"; id: string; label: string }
  | { kind: "agent"; id: string; entry: AgentEntry };

/** Group Workflow members by call and phase while retaining standalone status groups. */
export function groupAgents(entries: readonly AgentEntry[], running: string, finished: string): AgentListItem[] {
  const standalone = entries.filter((entry) => !entry.workflow);
  const active = standalone.filter((entry) => entry.state === "running");
  const rest = standalone.filter((entry) => entry.state !== "running");
  const out: AgentListItem[] = [];
  if (active.length && rest.length) out.push({ kind: "heading", id: "h:running", label: running });
  out.push(...active.map((entry): AgentListItem => ({ kind: "agent", id: entry.id, entry })));
  if (active.length && rest.length) out.push({ kind: "heading", id: "h:finished", label: finished });
  out.push(...rest.map((entry): AgentListItem => ({ kind: "agent", id: entry.id, entry })));
  const calls = new Map<string, Map<string, AgentEntry[]>>();
  for (const entry of entries) {
    if (!entry.workflow) continue;
    const { callId, phase = "" } = entry.workflow;
    const phases = calls.get(callId) ?? new Map<string, AgentEntry[]>();
    const group = phases.get(phase) ?? [];
    group.push(entry);
    phases.set(phase, group);
    calls.set(callId, phases);
  }
  let number = 0;
  for (const [callId, phases] of calls) {
    number++;
    for (const [phase, group] of phases) {
      out.push({ kind: "heading", id: `h:workflow:${JSON.stringify([callId, phase])}`, label: [`Workflow ${number}`, phase].filter(Boolean).join(" · ") });
      out.push(...group.map((entry): AgentListItem => ({ kind: "agent", id: entry.id, entry })));
    }
  }
  return out;
}

export const agentCounts = (entries: readonly AgentEntry[]) => ({
  total: entries.length,
  running: entries.filter((entry) => entry.state === "running").length,
});
