import {
  isOwnerStoppedTurn,
  isTurnInterruptionNotice,
} from "../../../../src/features/sessions/model/turnInterruption";
import type { Block, HostSession } from "./wire";
import { providerName } from "./provider-choices";

/** Display names never replace provider IDs retained in transcript authorship. */
export function transcriptSenderName(author?: string): string {
  return author ? providerName(author) : "bycoda";
}

type TurnModel = NonNullable<Block["turnModel"]>;
/** Presentation a finished or switched turn adds around its entry. */
type TurnChrome = {
  /** The finished turn's user block; its receipt (duration, model, metrics) follows this entry. */
  footer?: Block;
  /** The turn ran on a different model than the previous one and no switch row said so. */
  modelChange?: { from: TurnModel; to: TurnModel };
  /** The turn's model, for the assistant header. */
  modelName?: string;
};
export type TranscriptEntry =
  | ({ id: string; kind: "message"; block: Block; author?: string; /** Identical failures folded into this card. */ repeat?: number } & TurnChrome)
  | ({ id: string; kind: "activity"; blocks: Block[]; author?: string } & TurnChrome);
export type TranscriptView = "messages" | "details";

/** Older rows can grow or regroup the list without adding anything at its live end. */
export function transcriptTailStamp(entries: readonly TranscriptEntry[]) {
  const last = entries.at(-1);
  const block = last?.kind === "message" ? last.block : last?.blocks.at(-1);
  return block ? JSON.stringify([block.id, block.text?.length ?? 0, block.tool?.output?.length ?? 0]) : undefined;
}

/** Presentation only: folded into the turn's work row. User commands, results, notices and decisions stay separate. */
export function isTransientActivity(block: Block) {
  return (
    ["tool", "reasoning", "system"].includes(block.role) &&
    !block.notice &&
    !block.approval &&
    !block.draft &&
    !block.taskList &&
    !block.plan &&
    !block.shell &&
    !block.interjection &&
    !block.attachments?.length &&
    !block.image &&
    !block.orchestration &&
    !block.handoff &&
    !block.noteCard &&
    !block.secondOpinion &&
    !block.modelSwitch
  );
}
export function isQuietActivity(block: Block) {
  return (
    ["tool", "reasoning", "system"].includes(block.role) &&
    activityState(block) !== "failed" &&
    !block.notice &&
    !block.approval &&
    !block.draft &&
    !block.taskList &&
    !block.plan &&
    !block.shell &&
    !block.interjection &&
    !block.attachments?.length &&
    !block.image &&
    !block.orchestration &&
    !block.handoff &&
    !block.noteCard &&
    !block.secondOpinion &&
    !block.modelSwitch
  );
}

/** A failed tool retains a visible error summary; action-bearing records stay open. */
export function canCollapseToolFailure(block: Block) {
  const failed =
    activityState(block) === "failed" ||
    !!block.shell?.timedOut ||
    (block.shell?.exitCode !== undefined && block.shell.exitCode !== 0);
  return (
    block.role === "tool" &&
    failed &&
    !block.approval &&
    !block.interjection &&
    !block.plan &&
    !block.taskList &&
    !block.draft &&
    !block.orchestration &&
    !block.agentRun &&
    !block.handoff
  );
}
/** A plain system failure card (no tool, approval or structured content). */
export const isSystemFailure = (block: Block) =>
  block.role === "system" && block.notice === "error" && !block.tool && !block.approval && !block.attachments?.length;

/**
 * Folds an identical system failure into the latest one when only user messages lie between,
 * e.g. repeated sends to an archived session; returns the count the surviving card represents.
 */
function foldFailure(entries: TranscriptEntry[], block: Block): number {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry.kind !== "message") return 1;
    if (entry.block.role === "user") continue;
    if (!isSystemFailure(entry.block) || entry.block.text !== block.text) return 1;
    const count = (entry.repeat ?? 1) + 1;
    entries.splice(index, 1);
    return count;
  }
  return 1;
}

const sameModel = (a: TurnModel, b: TurnModel) => a.harness === b.harness && a.id === b.id;
const isTurnStart = (block: Block) => block.role === "user" && !block.draft && !block.internal;

/** What the turns before `end` leave for the next one: its model and whether a switch row followed. */
export type TurnContext = { model?: TurnModel; switched: boolean };
export function turnContextBefore(blocks: readonly Block[], end: number): TurnContext {
  let switched = false;
  for (let index = end - 1; index >= 0; index--) {
    const block = blocks[index]!;
    if (block.modelSwitch) switched = true;
    if (isTurnStart(block)) return { model: block.turnModel, switched };
  }
  return { switched };
}

/** Preserve chronology and keep actionable/error content outside collapsed activity. */
export function transcriptEntries(
  blocks: readonly Block[],
  fallbackAuthor?: string,
  presentation?: { view: TranscriptView; running: boolean },
  context: TurnContext = { switched: false },
): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  let author = fallbackAuthor;
  let previousModel = context.model;
  let switched = context.switched;
  let turnUser: Block | undefined;
  // Like desktop, a settled turn ends with its receipt; the running turn has none yet.
  const closeTurn = (last: boolean) => {
    const entry = entries.at(-1);
    if (turnUser?.durationMs != null && entry && !(last && presentation?.running)) entry.footer = turnUser;
    turnUser = undefined;
  };
  // Queued drafts and internal steering do not start a new visible provider turn.
  const turnStart = blocks.findLastIndex(
    (block) => block.role === "user" && !block.draft && !block.internal,
  );
  // Like desktop, the messages view folds a turn's finished work into one row; failures stay visible.
  let turnWork: Extract<TranscriptEntry, { kind: "activity" }> | undefined;
  for (const [index, block] of blocks.entries()) {
    if (block.internal) continue;
    if (block.modelSwitch) switched = true;
    if (block.role === "user") closeTurn(false);
    if (block.role === "user" && !block.draft) turnWork = undefined;
    if (block.role === "user" && block.turnModel) author = block.turnModel.harness;
    let chrome: TurnChrome = {};
    if (isTurnStart(block)) {
      turnUser = block;
      if (block.turnModel && previousModel && !switched && !sameModel(previousModel, block.turnModel))
        chrome = { modelChange: { from: previousModel, to: block.turnModel } };
      previousModel = block.turnModel ?? previousModel;
      switched = false;
    } else if (block.role === "assistant" && turnUser?.turnModel) chrome = { modelName: turnUser.turnModel.name };
    if (
      presentation?.view === "messages" &&
      isTransientActivity(block) &&
      activityState(block) !== "failed" &&
      !(presentation.running && index > turnStart && activityState(block) === "running")
    ) {
      if (turnWork) turnWork.blocks.push(block);
      else {
        turnWork = { id: `work:${block.id}`, kind: "activity", blocks: [block], author };
        entries.push(turnWork);
      }
      continue;
    }
    const previous = entries.at(-1);
    // A footer belongs after the whole turn, so a grown activity row drops the closed one.
    if (isQuietActivity(block)) {
      if (previous?.kind === "activity" && !previous.footer) previous.blocks.push(block);
      else entries.push({ id: `activity:${block.id}`, kind: "activity", blocks: [block], author });
    } else if (isSystemFailure(block) && block.text) {
      const repeat = foldFailure(entries, block);
      entries.push({ id: block.id, kind: "message", block, author, ...(repeat > 1 ? { repeat } : {}) });
    } else entries.push({ id: block.id, kind: "message", block, author, ...chrome });
  }
  closeTurn(true);
  return entries;
}

/** Reuse completed presentation; only the first changed turn needs regrouping.
 * A cheap identity scan still validates the prefix, including edits to old blocks.
 */
export class TranscriptPresentation {
  private blocks: readonly Block[] = [];
  private entries: TranscriptEntry[] = [];
  private author?: string;
  private view?: TranscriptView;
  private running = false;
  update(blocks: readonly Block[], author?: string, presentation?: { view: TranscriptView; running: boolean }) {
    let common = 0;
    const compatible = this.author === author && this.view === presentation?.view;
    if (compatible) while (common < Math.min(blocks.length, this.blocks.length) && blocks[common] === this.blocks[common]) common++;
    if (compatible && common === blocks.length && common === this.blocks.length && this.running === !!presentation?.running) return this.entries;
    // Also revisit the previous turn when a newly appended user starts the next one.
    let start = Math.max(0, common - 1);
    while (start > 0) {
      const block = blocks[start];
      if (block?.role === "user" && !block.draft && !block.internal) break;
      start--;
    }
    const boundary = compatible && start > 0 ? this.entries.findIndex((entry) => entry.kind === "message" && entry.block === blocks[start]) : 0;
    if (boundary < 0) start = 0;
    const prefix = boundary > 0 ? this.entries.slice(0, boundary) : [];
    this.entries = prefix.concat(
      transcriptEntries(
        blocks.slice(start),
        prefix.at(-1)?.author ?? author,
        presentation,
        prefix.length ? turnContextBefore(blocks, start) : undefined,
      ),
    );
    this.blocks = blocks;
    this.author = author;
    this.view = presentation?.view;
    this.running = !!presentation?.running;
    return this.entries;
  }
}

/** Joining a complete response is a copy/menu operation, not work for every revision. */
export function completeResponseText(blocks: readonly Block[], id: string) {
  const index = blocks.findIndex((block) => block.id === id);
  if (index < 0 || blocks[index]?.role !== "assistant") return undefined;
  let start = index;
  while (start > 0 && blocks[start - 1]?.role !== "user") start--;
  const text: string[] = [];
  for (let position = start; position < blocks.length; position++) {
    const block = blocks[position]!;
    if (block.role === "user") break;
    if (block.role === "assistant" && block.text) text.push(block.text);
  }
  return text.join("\n\n");
}

/** "mcp__t3-code__delegate_task" reads as "delegate task": drop the server prefix and underscores. */
export function readableToolName(name: string) {
  const tool = /^mcp__.+?__(.+)$/.exec(name)?.[1];
  return tool ? tool.replace(/_+/g, " ").trim() || name : name;
}

export function activityTitle(block: Block) {
  const title = block.agentRun?.name || block.tool?.title || block.text || block.tool?.detail || "";
  return readableToolName(title.replace(/\s+/g, " ").trim());
}

/** Some providers keep the command in text and its result in separate fields. */
export function toolResultTexts(block: Block): string[] {
  if (block.role !== "tool") return [];
  const main = block.text || block.tool?.detail || block.tool?.output || "";
  return [...new Set([block.tool?.detail, block.tool?.output])].filter(
    (value): value is string => !!value?.trim() && value !== main,
  );
}

export function activityState(
  block: Block,
): "running" | "failed" | "completed" | "stopped" | "neutral" {
  const status = block.tool?.status?.toLowerCase();
  if (
    block.notice === "error" ||
    ["error", "failed", "denied", "rejected", "cancelled", "canceled"].includes(status ?? "")
  )
    return "failed";
  if (status === "stopped") return "stopped";
  // Terminal provider state wins over an old streaming flag.
  if (
    ["completed", "done", "success"].includes(status ?? "") ||
    block.agentRun?.endedAt !== undefined
  )
    return "completed";
  if (block.streaming || ["running", "pending", "in_progress"].includes(status ?? ""))
    return "running";
  return "neutral";
}

export function activitySummary(blocks: readonly Block[]) {
  const running = blocks.findLast((block) => activityState(block) === "running");
  const tools = blocks.filter((block) => block.role === "tool");
  const latest = running || tools.at(-1) || blocks.at(-1);
  const completed =
    tools.length > 0 && tools.every((block) => activityState(block) === "completed");
  const state = running
    ? "running"
    : blocks.some((block) => activityState(block) === "failed")
      ? "failed"
      : blocks.some((block) => activityState(block) === "stopped")
        ? "stopped"
        : completed
          ? "completed"
          : "neutral";
  return {
    count: tools.length || blocks.length,
    running: !!running,
    completed,
    state,
    title: latest ? activityTitle(latest) : "",
  };
}

/** A terminal provider record must not retain live Writing feedback from an old flag. */
export function isBlockStreaming(block: Block) {
  return !!block.streaming && activityState(block) === "running";
}

/**
 * Desktop's "Thinking…" stand-in: the running turn has produced nothing readable yet. A running
 * reasoning row already says Thinking, so readable reasoning counts as output here.
 */
export function awaitingFirstOutput(blocks: readonly Block[]): boolean {
  const start = blocks.findLastIndex(isTurnStart);
  if (start < 0) return false;
  for (let index = start + 1; index < blocks.length; index++) {
    const block = blocks[index]!;
    if (block.internal || block.role === "user" || block.role === "system") continue;
    if (block.role === "tool" || block.role === "approval") return false;
    if (block.text?.trim() || block.attachments?.length || block.image) return false;
    if (block.plan || block.taskList || block.agentRun || block.orchestration) return false;
  }
  return true;
}

/** A turn cut off without the owner stopping it: desktop offers Continue with its continue prompt. */
export function canContinueInterruptedTurn(
  session: Pick<HostSession, "status"> & { session: Pick<HostSession["session"], "blocks" | "worktreeRemoved"> },
): boolean {
  if (session.status === "running" || session.session.worktreeRemoved) return false;
  const blocks = session.session.blocks;
  if (isOwnerStoppedTurn(blocks)) return false;
  return session.status === "interrupted" || isTurnInterruptionNotice(blocks.at(-1));
}
