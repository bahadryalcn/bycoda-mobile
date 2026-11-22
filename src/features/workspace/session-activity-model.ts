import type { Block } from "@/domain/types";
import { listAgents, type AgentEntry } from "./agents-model";
import { isRunTurnStart } from "./run-status-model";
import type { ChildSessionEntry } from "./subagent-sessions-model";

type Copy = (tr: string, en: string, values?: Record<string, string | number>) => string;

/**
 * What the session is doing, from the reader's side:
 * - `working`: the agent itself is at it.
 * - `waiting`: the agent yielded and its subagents or background tasks work for it.
 * - `needs-input`: an approval or a question waits on the user.
 * - `background`: only commands or delegated sessions left running keep it open.
 * - `done`: it just finished; the owner of this state decides how long to show it.
 * - `idle`: nothing to say.
 * Port of the pure core of desktop `deriveActivityDock`, which is not an approved mobile contract.
 */
export type ActivityState = "working" | "waiting" | "needs-input" | "background" | "done" | "idle";

export type AgentCounts = { total: number; queued: number; running: number; done: number; failed: number; stopped: number; interrupted: number };

export type SessionActivityInput = {
  blocks: readonly Block[] | undefined;
  /** The Host reports the run as running. */
  live: boolean;
  pendingQuestion?: boolean;
  backgroundTasks?: readonly string[];
  /** How many background tasks are subagents; undefined when the provider cannot tell. */
  backgroundAgents?: number;
  /** Delegated child sessions of this session. */
  children?: readonly ChildSessionEntry[];
  /** The run just ended; shown as `done` until the caller clears it. */
  justFinished?: boolean;
};

export type SessionActivity = {
  state: ActivityState;
  /** Host-recorded start of the latest user turn; never inferred from a tool. */
  startedAt?: number;
  /** For `waiting`: agents and other background tasks the agent waits on. */
  waitingOn: { agents: number; tasks: number };
  counts: AgentCounts;
};

const DELEGATED = "delegated:";
const delegatedChildId = (blockId: string) => (blockId.startsWith(DELEGATED) ? blockId.slice(DELEGATED.length) : undefined);

/**
 * The one counting rule for this session's subagents: every delegated run in the transcript plus every
 * child session, each once. A child session is the truth for its own transcript block, so the block is dropped.
 * An unfinished transcript call is interrupted after its parent run ends.
 */
export function sessionAgentEntries(blocks: readonly Block[] | undefined, children: readonly ChildSessionEntry[], live: boolean): AgentEntry[] {
  const childIds = new Set(children.map((child) => child.sessionId));
  return listAgents(blocks)
    .filter((entry) => !childIds.has(delegatedChildId(entry.id) ?? ""))
    .map((entry) => !live && (entry.state === "running" || entry.state === "queued") ? { ...entry, state: "interrupted" } : entry);
}

export function countAgents(blocks: readonly Block[] | undefined, children: readonly ChildSessionEntry[] = [], live: boolean): AgentCounts {
  const counts: AgentCounts = { total: 0, queued: 0, running: 0, done: 0, failed: 0, stopped: 0, interrupted: 0 };
  const add = (state: AgentEntry["state"]) => {
    counts.total++;
    if (state === "running") counts.running++;
    else if (state === "queued") counts.queued++;
    else if (state === "interrupted") counts.interrupted++;
    else if (state === "failed") counts.failed++;
    else if (state === "stopped" || state === "cancelled") counts.stopped++;
    else if (state === "completed") counts.done++;
  };
  for (const entry of sessionAgentEntries(blocks, children, live)) add(entry.state);
  for (const child of children) add(child.state);
  return counts;
}

const validStart = (value: number | undefined) => value !== undefined && Number.isFinite(value) && value >= 0;

export function deriveSessionActivity(input: SessionActivityInput): SessionActivity {
  const { blocks = [], live, backgroundTasks = [], backgroundAgents } = input;
  const counts = countAgents(blocks, input.children, live);
  const startedAt = blocks.findLast(isRunTurnStart)?.startedAt;
  const background = backgroundTasks.length;
  const backgroundOnly = live && background > 0 && backgroundAgents === 0;
  const agents = Math.min(background, backgroundAgents ?? counts.running);
  const waitingOn = { agents, tasks: Math.max(0, background - agents) };
  let state: ActivityState = "idle";
  if (live) {
    const approval = blocks.some((block) => block.approval && !block.approval.decided);
    state = input.pendingQuestion || approval ? "needs-input" : backgroundOnly ? "background" : background > 0 ? "waiting" : "working";
  } else if (counts.running > 0) state = "background";
  else if (input.justFinished) state = "done";
  return { state, startedAt: live && validStart(startedAt) ? startedAt : undefined, waitingOn, counts };
}

/** Words for the state, without the clock. Empty for idle. */
export function activityStateLabel(activity: SessionActivity, copy: Copy): string {
  const { agents, tasks } = activity.waitingOn;
  switch (activity.state) {
    case "working": return copy("Çalışıyor", "Working");
    case "waiting":
      if (agents > 0) return agents === 1 ? copy("1 ajan bekleniyor", "Waiting for 1 agent") : copy("{p0} ajan bekleniyor", "Waiting for {p0} agents", { p0: agents });
      return tasks === 1 ? copy("1 arka plan görevi bekleniyor", "Waiting for 1 background task") : copy("{p0} arka plan görevi bekleniyor", "Waiting for {p0} background tasks", { p0: tasks });
    case "needs-input": return copy("Yanıtını bekliyor", "Needs your answer");
    case "background": return copy("Arka planda çalışıyor", "Running in background");
    case "done": return copy("Bitti", "Done");
    case "idle": return "";
  }
}

/** "2 running · 3 done" (short) or "2 agents running, 3 finished" (accessibility); zero counts are left out. */
export function agentCountText(counts: AgentCounts, copy: Copy, long = false): string {
  const parts = [
    counts.running && (long
      ? counts.running === 1 ? copy("1 ajan çalışıyor", "1 agent running") : copy("{p0} ajan çalışıyor", "{p0} agents running", { p0: counts.running })
      : copy("{p0} çalışıyor", "{p0} running", { p0: counts.running })),
    counts.queued && copy("{p0} sırada", "{p0} queued", { p0: counts.queued }),
    counts.done && (long ? copy("{p0} bitti", "{p0} finished", { p0: counts.done }) : copy("{p0} bitti", "{p0} done", { p0: counts.done })),
    counts.failed && copy("{p0} başarısız", "{p0} failed", { p0: counts.failed }),
    counts.stopped && copy("{p0} durduruldu", "{p0} stopped", { p0: counts.stopped }),
    counts.interrupted && copy("{p0} kesildi", "{p0} interrupted", { p0: counts.interrupted }),
  ].filter(Boolean);
  return parts.join(long ? ", " : " · ");
}
