import type { Block, RemoteProvider } from "@/domain/types";
import { REMOTE_PROVIDERS } from "@/domain/providers";
import type { DelegationParent } from "../../../../src/shared/model/host-contracts/delegation";
import type { AgentEntry } from "./agents-model";
import { agentStateLabel } from "./agent-state";
import { activityTitle, agentRunState, type TranscriptEntry } from "./transcript-model";
import { formatElapsed, isRunTurnStart, subagentNow } from "./run-status-model";
import { userTurn } from "./user-turn";
import type { HostSession } from "./wire";
import { delegatedChildId, type AgentCounts } from "./session-activity-model";
import { sessionModelName } from "./catalog";
import type { ChildSessionEntry } from "./subagent-sessions-model";

type Copy = (tr: string, en: string, values?: Record<string, string | number>) => string;

export type RunState = AgentEntry["state"];
/** Semantic ink of a run's dot and state word. */
export type RunTone = "live" | "success" | "danger" | "warning" | "muted";

/**
 * One subagent as every surface draws it (transcript row, group, Agents sheet): an inline provider
 * run from its transcript block, or a delegated run that is its own session.
 */
export type SubagentRunView = {
  /** Stable row id: the block id, or `child:<sessionId>` for a child without a block. */
  id: string;
  /** The transcript block of an inline run; absent for a child-only row. */
  blockId?: string;
  name: string;
  state: RunState;
  tone: RunTone;
  /** Provider whose mark stands for the run: the child's own, the model's vendor, else the parent. */
  harness?: string;
  /** Readable model name, e.g. "Claude Sonnet 4.5". */
  model?: string;
  agentType?: string;
  startedAt?: number;
  endedAt?: number;
  /** The third line: the latest step while running, the report when done, the first error line when failed. */
  note?: { text: string; danger: boolean };
  /** Delegated child session the row opens instead of the in-sheet details. */
  child?: { sessionId: string; projectId: string };
};

export const isLiveRun = (state: RunState) => state === "running" || state === "queued";

export function runTone(state: RunState): RunTone {
  switch (state) {
    case "running": return "live";
    case "completed": return "success";
    case "failed": return "danger";
    case "stopped":
    case "interrupted": return "warning";
    case "queued":
    case "cancelled":
    case "neutral": return "muted";
  }
}

const isProvider = (value: string | undefined): value is RemoteProvider => REMOTE_PROVIDERS.includes(value as RemoteProvider);

// The vendor a bare model id names, like desktop `modelHarness` without its catalog.
const VENDOR_HARNESS: [RegExp, RemoteProvider][] = [
  [/(^|[-/:])claude|^(opus|sonnet|haiku|fable)(\b|-)/i, "claude"],
  [/(^|[-/:])(gpt|codex)|^o\d/i, "codex"],
  [/(^|[-/:])grok/i, "grok"],
  [/(^|[-/:])composer/i, "cursor"],
  [/(^|[-/:])gemini/i, "antigravity"],
];

/** The provider a run's model names: a `harness:model` prefix, else the model's vendor, else `fallback`. */
export function runHarness(model: string | undefined, fallback?: string): string | undefined {
  const raw = model?.trim();
  if (raw) {
    const colon = raw.indexOf(":");
    const prefix = colon > 0 ? raw.slice(0, colon).toLowerCase() : "";
    if (isProvider(prefix)) return prefix;
    const slug = colon >= 0 ? raw.slice(colon + 1) : raw;
    const vendor = VENDOR_HARNESS.find(([pattern]) => pattern.test(slug))?.[1];
    if (vendor) return vendor;
  }
  return fallback;
}

/** The model's catalog name where the bundled catalog knows it, else the id without its provider prefix. */
export function runModelName(model: string | undefined, harness?: string): string | undefined {
  const raw = model?.trim();
  if (!raw) return undefined;
  return (isProvider(harness) ? sessionModelName({ harness, model: raw }) : raw).replace(/^[^:]+:/, "") || undefined;
}

const squash = (text?: string) => text?.replace(/\s+/g, " ").trim() || undefined;
/** The first non-empty line, for an error that may carry a stack or a log after it. */
export function firstLine(text: string | undefined) {
  return text?.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
}

/** The child session a transcript run stands for: its `delegated:<id>` block names one this session lists. */
export function childOfBlock(blockId: string, children: readonly ChildSessionEntry[]): ChildSessionEntry | undefined {
  const childId = delegatedChildId(blockId);
  return childId ? children.find((child) => child.sessionId === childId) : undefined;
}

function note(state: RunState, latest: string | undefined, report: string | undefined, error: string | undefined) {
  if (state === "failed") {
    const text = firstLine(error) ?? squash(latest);
    return text ? { text, danger: !!firstLine(error) } : undefined;
  }
  if (state === "completed") {
    const text = squash(report) ?? squash(latest);
    return text ? { text, danger: false } : undefined;
  }
  const text = squash(latest);
  return text ? { text, danger: false } : undefined;
}

/**
 * An inline run as a row. A run the parent left unfinished reads interrupted once the parent stops,
 * and a block that names a listed child session takes the child's state and opens it.
 */
export function subagentRunView(
  block: Block,
  input: { live: boolean; children?: readonly ChildSessionEntry[]; parentProvider?: string },
): SubagentRunView {
  const run = block.agentRun;
  const child = childOfBlock(block.id, input.children ?? []);
  const own = agentRunState(block);
  const state: RunState = child?.state ?? (!input.live && isLiveRun(own) ? "interrupted" : own);
  const model = child?.model ?? run?.model;
  const detail = block.tool?.detail ?? block.tool?.output;
  const harness = child?.harness ?? runHarness(model, input.parentProvider);
  return {
    id: block.id,
    blockId: block.id,
    name: run?.name || activityTitle(block),
    state,
    tone: runTone(state),
    harness,
    model: runModelName(model, harness),
    ...(run?.agentType ? { agentType: run.agentType } : {}),
    ...(run?.startedAt !== undefined ? { startedAt: run.startedAt } : child ? { startedAt: child.startedAt } : {}),
    ...(run?.endedAt !== undefined ? { endedAt: run.endedAt } : child?.endedAt !== undefined ? { endedAt: child.endedAt } : {}),
    note: note(state, subagentNow(block), isLiveRun(state) ? undefined : detail, child?.error ?? detail),
    ...(child ? { child: { sessionId: child.sessionId, projectId: child.projectId } } : {}),
  };
}

/** A delegated child session as a row; it always opens its own session. */
export function childRunView(child: ChildSessionEntry, parentProvider?: string): SubagentRunView {
  const harness = child.harness ?? runHarness(child.model, parentProvider);
  return {
    id: `child:${child.sessionId}`,
    name: child.title,
    state: child.state,
    tone: runTone(child.state),
    harness,
    model: runModelName(child.model, harness),
    startedAt: child.startedAt,
    ...(child.endedAt !== undefined ? { endedAt: child.endedAt } : {}),
    ...(child.state === "failed" && child.error ? { note: { text: firstLine(child.error)!, danger: true } } : {}),
    child: { sessionId: child.sessionId, projectId: child.projectId },
  };
}

/** Elapsed of one run: to its end, or to `now` while it runs; undefined without a start. */
export function runElapsedMs(view: Pick<SubagentRunView, "startedAt" | "endedAt" | "state">, now: number): number | undefined {
  if (view.startedAt === undefined) return undefined;
  const end = view.endedAt ?? (isLiveRun(view.state) ? now : undefined);
  return end === undefined || end < view.startedAt ? undefined : end - view.startedAt;
}

/** Elapsed of a group: from its first start to its last end, or to `now` while any member runs. */
export function groupElapsedMs(views: readonly SubagentRunView[], now: number): number | undefined {
  const starts = views.flatMap((view) => (view.startedAt === undefined ? [] : [view.startedAt]));
  if (!starts.length) return undefined;
  const start = Math.min(...starts);
  const live = views.some((view) => isLiveRun(view.state));
  const ends = views.flatMap((view) => (view.endedAt === undefined ? [] : [view.endedAt]));
  const end = live ? now : ends.length ? Math.max(...ends) : undefined;
  return end === undefined || end < start ? undefined : end - start;
}

/** The same tally as the session's agent counts, for any set of rows. */
export function countRuns(states: readonly RunState[]): AgentCounts {
  const counts: AgentCounts = { total: 0, queued: 0, running: 0, done: 0, failed: 0, stopped: 0, interrupted: 0 };
  for (const state of states) {
    counts.total++;
    if (state === "running") counts.running++;
    else if (state === "queued") counts.queued++;
    else if (state === "interrupted") counts.interrupted++;
    else if (state === "failed") counts.failed++;
    else if (state === "stopped" || state === "cancelled") counts.stopped++;
    else if (state === "completed") counts.done++;
  }
  return counts;
}

/** One run is a flat row; two or more of one turn share a header. */
export const subagentRunLayout = (count: number): "row" | "group" => (count > 1 ? "group" : "row");

/** Overlapping marks of a group header: up to `max` providers, then "+N" for the rest. */
export function runAvatars(views: readonly SubagentRunView[], max = 3) {
  return { shown: views.slice(0, max).map((view) => ({ id: view.id, harness: view.harness })), extra: Math.max(0, views.length - max) };
}

/** A collapsed settled group still shows its failures; an open group shows every run. */
export function visibleGroupRuns(views: readonly SubagentRunView[], open: boolean) {
  return open ? views : views.filter((view) => view.state === "failed");
}

/**
 * A user turn the owner (or an app, task or assistant acting for them) started. A delegate's
 * completion or message and an app resume prompt are notices inside the running turn, so they
 * never cut the latest turn's subagents off.
 */
export const isOwnerTurnStart = (block: Block) => isRunTurnStart(block) && userTurn(block).kind === "message";

/** One run the pill counts: its state and, once settled, when it ended. */
export type PillRun = { state: RunState; endedAt?: number };

/**
 * The latest turn's subagents for the floating pill: inline runs after the last owner turn, plus the
 * child sessions started since then. Empty when the latest turn started none, so the pill leaves
 * with the next user message. `endedAt` is the latest known end of the turn's work.
 */
export function latestTurnRuns(
  blocks: readonly Block[] | undefined,
  children: readonly ChildSessionEntry[],
  live: boolean,
): { runs: PillRun[]; endedAt?: number } {
  const list = blocks ?? [];
  const start = list.findLastIndex(isOwnerTurnStart);
  const turn = start >= 0 ? list[start] : undefined;
  const since = turn?.startedAt;
  const runs: PillRun[] = [];
  const counted = new Set<string>();
  const add = (state: RunState, endedAt: number | undefined) => runs.push(endedAt === undefined ? { state } : { state, endedAt });
  for (const block of start >= 0 ? list.slice(start + 1) : list) {
    if (!block.agentRun || block.internal) continue;
    const view = subagentRunView(block, { live, children });
    if (view.child) counted.add(view.child.sessionId);
    add(view.state, view.endedAt);
  }
  for (const child of children) {
    if (counted.has(child.sessionId)) continue;
    // Without a turn start only a running child belongs to "now".
    if (since !== undefined ? child.startedAt >= since : child.state === "running") add(child.state, child.endedAt);
  }
  const ends = runs.flatMap((run) => (run.endedAt === undefined ? [] : [run.endedAt]));
  if (turn?.startedAt !== undefined && turn.durationMs != null) ends.push(turn.startedAt + turn.durationMs);
  return ends.length ? { runs, endedAt: Math.max(...ends) } : { runs };
}

export function latestTurnRunStates(
  blocks: readonly Block[] | undefined,
  children: readonly ChildSessionEntry[],
  live: boolean,
): RunState[] {
  return latestTurnRuns(blocks, children, live).runs.map((run) => run.state);
}

/** How long a settled pill stays once the session is idle; a reopened old session shows none. */
export const SETTLED_PILL_MS = 2 * 60_000;

/**
 * The pill's tally, or undefined when there is nothing to show: no runs in the latest turn, or every
 * run settled, the session idle and the last end more than `SETTLED_PILL_MS` ago. An unknown end
 * keeps the settled pill until the next user turn.
 */
export function agentsPillCounts(
  blocks: readonly Block[] | undefined,
  children: readonly ChildSessionEntry[],
  live: boolean,
  now: number,
): AgentCounts | undefined {
  const { runs, endedAt } = latestTurnRuns(blocks, children, live);
  if (!runs.length) return undefined;
  const settled = runs.every((run) => !isLiveRun(run.state));
  if (settled && !live && endedAt !== undefined && now - endedAt > SETTLED_PILL_MS) return undefined;
  return countRuns(runs.map((run) => run.state));
}

/**
 * When a shown settled pill leaves on its own (idle session, every run ended at a known time), so an
 * untouched screen can re-read the pill at that moment. Undefined while nothing would expire it.
 */
export function agentsPillExpiresAt(
  blocks: readonly Block[] | undefined,
  children: readonly ChildSessionEntry[],
  live: boolean,
): number | undefined {
  if (live) return undefined;
  const { runs, endedAt } = latestTurnRuns(blocks, children, live);
  if (!runs.length || endedAt === undefined || runs.some((run) => isLiveRun(run.state))) return undefined;
  return endedAt + SETTLED_PILL_MS;
}

/** "2 running" while any run works (the total is in the label), then the settled tally ("3 done", "2 done · 1 failed"). */
export function agentsPillText(counts: AgentCounts, copy: Copy, settled: (counts: AgentCounts) => string): string {
  if (counts.running) return copy("{p0} çalışıyor", "{p0} running", { p0: counts.running });
  if (counts.queued) return copy("{p0} sırada", "{p0} queued", { p0: counts.queued });
  return settled(counts);
}

/** The pill's spoken tally: "2 of 3 subagents running" while any runs, else the long settled tally. */
export function agentsPillLabel(counts: AgentCounts, copy: Copy, settled: (counts: AgentCounts) => string): string {
  if (counts.running)
    return copy("{p1} alt ajandan {p0} tanesi çalışıyor", "{p0} of {p1} subagents running", { p0: counts.running, p1: counts.total });
  return settled(counts);
}

/**
 * Agents entries of the latest owner turn; only these follow the session's live flag. An older
 * turn's unfinished run never revives as running when a later turn works. Without any owner turn
 * in the loaded entries every agents entry belongs to the latest turn.
 */
export function latestTurnAgentsIds(entries: readonly TranscriptEntry[]): string[] {
  const start = entries.findLastIndex((entry) => entry.kind === "message" && isOwnerTurnStart(entry.block));
  return entries.slice(start + 1).flatMap((entry) => (entry.kind === "agents" ? [entry.id] : []));
}

/**
 * The session's run entries (Agents sheet) with an older turn's unfinished run settled as
 * interrupted, like the transcript's rows: only the latest owner turn's runs follow `live`.
 * Without an owner turn in `blocks` every run belongs to the latest turn.
 */
export function settleEarlierTurnRuns<E extends { id: string; state: RunState }>(
  entries: readonly E[],
  blocks: readonly Block[] | undefined,
  live: boolean,
): E[] {
  const list = blocks ?? [];
  const start = list.findLastIndex(isOwnerTurnStart);
  if (!live || start <= 0) return [...entries];
  const earlier = new Set(list.slice(0, start).flatMap((block) => (block.agentRun ? [block.id] : [])));
  return entries.map((entry) => (earlier.has(entry.id) && isLiveRun(entry.state) ? { ...entry, state: "interrupted" as const } : entry));
}

/** A live clock is needed while any run or child session of the list still works. */
export const anyLiveRun = (states: readonly RunState[]) => states.some(isLiveRun);

/** "3 subagents" for a group header. */
export function runGroupTitle(count: number, copy: Copy) {
  return count === 1 ? copy("1 alt ajan", "1 subagent") : copy("{p0} alt ajan", "{p0} subagents", { p0: count });
}

/** "8 min 2 s" for a finished run's span, seconds kept under an hour. */
export function runDurationText(ms: number | undefined, copy: Copy): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return "";
  const total = Math.max(1, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600), minutes = Math.floor((total % 3600) / 60), seconds = total % 60;
  if (hours) return minutes ? copy("{p0} sa {p1} dk", "{p0} h {p1} min", { p0: hours, p1: minutes }) : copy("{p0} sa", "{p0} h", { p0: hours });
  if (minutes) return seconds ? copy("{p0} dk {p1} sn", "{p0} min {p1} s", { p0: minutes, p1: seconds }) : copy("{p0} dk", "{p0} min", { p0: minutes });
  return copy("{p0} sn", "{p0} s", { p0: seconds });
}

/** An open child session's own state: the Host's run status, then the parent link's last outcome. */
export function childRunState(session: Pick<HostSession, "status">, link: Pick<DelegationParent, "status">): RunState {
  if (session.status === "running") return "running";
  if (session.status === "interrupted") return "interrupted";
  if (link.status === "failed") return "failed";
  if (link.status === "cancelled") return "stopped";
  return "completed";
}

/**
 * When the child's latest round started and how long a settled one took. The Host-recorded turn
 * duration wins; otherwise the link's `finishedAt`, else the session's `updatedAt`, which is only
 * approximately the end (a later title or metadata write also moves it).
 */
export function childRunTiming(
  session: Pick<HostSession, "status" | "updatedAt"> & { session: Pick<HostSession["session"], "blocks"> },
  link: Pick<DelegationParent, "startedAt" | "finishedAt">,
): { startedAt?: number; durationMs?: number } {
  const turn = session.session.blocks.findLast(isRunTurnStart);
  const startedAt = turn?.startedAt ?? link.startedAt;
  if (session.status === "running") return { startedAt };
  if (turn?.durationMs != null) return { startedAt, durationMs: turn.durationMs };
  const end = link.finishedAt ?? session.updatedAt;
  return { startedAt, ...(end >= startedAt ? { durationMs: end - startedAt } : {}) };
}

/** "Working 2:13", "Finished in 8 min 2 s", or the plain state word. */
export function childStatusText(state: RunState, timing: { startedAt?: number; durationMs?: number }, now: number, copy: Copy): string {
  if (state === "running" && timing.startedAt !== undefined && timing.startedAt <= now)
    return copy("Çalışıyor {p0}", "Working {p0}", { p0: formatElapsed(now - timing.startedAt) });
  if (state === "completed" && timing.durationMs !== undefined)
    return copy("{p0} içinde tamamlandı", "Finished in {p0}", { p0: runDurationText(timing.durationMs, copy) });
  return agentStateLabel(state, copy);
}

type RouteState = { index?: number; routes?: readonly { name?: string; params?: object }[] } | undefined;
/** The page under this one in the stack is the given session, so Back returns to it. */
export function previousRouteIs(state: RouteState, sessionId: string): boolean {
  const index = state?.index ?? -1;
  const previous = index > 0 ? state?.routes?.[index - 1] : undefined;
  return previous?.name === "session/[id]" && (previous.params as { id?: unknown } | undefined)?.id === sessionId;
}
