import type { Block } from "./wire";

export type TranscriptEntry =
  | { id: string; kind: "message"; block: Block; author?: string; /** Identical failures folded into this card. */ repeat?: number }
  | { id: string; kind: "activity"; blocks: Block[]; author?: string };
export type TranscriptView = "messages" | "details";

/** Presentation only. User commands, results, notices and decisions never disappear. */
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
    !block.secondOpinion
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
    !block.secondOpinion
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

/** Preserve chronology and keep actionable/error content outside collapsed activity. */
export function transcriptEntries(
  blocks: readonly Block[],
  fallbackAuthor?: string,
  presentation?: { view: TranscriptView; running: boolean },
): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  let author = fallbackAuthor;
  // Queued drafts and internal steering do not start a new visible provider turn.
  const turnStart = blocks.findLastIndex(
    (block) => block.role === "user" && !block.draft && !block.internal,
  );
  for (const [index, block] of blocks.entries()) {
    if (block.internal) continue;
    if (block.role === "user" && block.turnModel) author = block.turnModel.harness;
    if (
      presentation?.view === "messages" &&
      isTransientActivity(block) &&
      !(presentation.running && index > turnStart && activityState(block) === "running")
    )
      continue;
    const previous = entries.at(-1);
    if (isQuietActivity(block)) {
      if (previous?.kind === "activity") previous.blocks.push(block);
      else entries.push({ id: `activity:${block.id}`, kind: "activity", blocks: [block], author });
    } else if (isSystemFailure(block) && block.text) {
      const repeat = foldFailure(entries, block);
      entries.push({ id: block.id, kind: "message", block, author, ...(repeat > 1 ? { repeat } : {}) });
    } else entries.push({ id: block.id, kind: "message", block, author });
  }
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
    this.entries = prefix.concat(transcriptEntries(blocks.slice(start), prefix.at(-1)?.author ?? author, presentation));
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

export function activityTitle(block: Block) {
  const title = block.agentRun?.name || block.tool?.title || block.text || block.tool?.detail || "";
  return title.replace(/\s+/g, " ").trim();
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
