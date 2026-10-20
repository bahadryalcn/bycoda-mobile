import type { Block } from "./wire";

export type TranscriptEntry =
  | { id: string; kind: "message"; block: Block; author?: string }
  | { id: string; kind: "activity"; blocks: Block[]; author?: string };
export type TranscriptView = "messages" | "details";

/** Presentation only. User commands, results, notices and decisions never disappear. */
export function isTransientActivity(block: Block) {
  return ["tool", "reasoning", "system"].includes(block.role) &&
    !block.notice && !block.approval && !block.draft && !block.taskList &&
    !block.plan && !block.shell && !block.interjection && !block.attachments?.length &&
    !block.image && !block.orchestration && !block.handoff && !block.noteCard && !block.secondOpinion;
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
    !block.handoff && !block.noteCard && !block.secondOpinion
  );
}

/** A failed tool retains a visible error summary; action-bearing records stay open. */
export function canCollapseToolFailure(block: Block) {
  const failed = activityState(block) === "failed" || !!block.shell?.timedOut ||
    (block.shell?.exitCode !== undefined && block.shell.exitCode !== 0);
  return block.role === "tool" && failed && !block.approval && !block.interjection &&
    !block.plan && !block.taskList && !block.draft && !block.orchestration && !block.agentRun && !block.handoff;
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
  const turnStart = blocks.findLastIndex((block) => block.role === "user" && !block.draft && !block.internal);
  for (const [index, block] of blocks.entries()) {
    if (block.internal) continue;
    if (block.role === "user" && block.turnModel) author = block.turnModel.harness;
    if (presentation?.view === "messages" && isTransientActivity(block) &&
      !(presentation.running && index > turnStart && activityState(block) === "running")) continue;
    const previous = entries.at(-1);
    if (isQuietActivity(block)) {
      if (previous?.kind === "activity") previous.blocks.push(block);
      else entries.push({ id: `activity:${block.id}`, kind: "activity", blocks: [block], author });
    } else entries.push({ id: block.id, kind: "message", block, author });
  }
  return entries;
}

export function activityTitle(block: Block) {
  const title = block.agentRun?.name || block.tool?.title || block.text || block.tool?.detail || "";
  return title.replace(/\s+/g, " ").trim();
}

/** Some providers keep the command in text and its result in separate fields. */
export function toolResultTexts(block: Block): string[] {
  if (block.role !== "tool") return [];
  const main = block.text || block.tool?.detail || block.tool?.output || "";
  return [...new Set([block.tool?.detail, block.tool?.output])]
    .filter((value): value is string => !!value?.trim() && value !== main);
}

export function activityState(block: Block): "running" | "failed" | "completed" | "stopped" | "neutral" {
  const status = block.tool?.status?.toLowerCase();
  if (block.notice === "error" || ["error", "failed", "denied", "rejected", "cancelled", "canceled"].includes(status ?? ""))
    return "failed";
  if (status === "stopped") return "stopped";
  // Terminal provider state wins over an old streaming flag.
  if (["completed", "done", "success"].includes(status ?? "") || block.agentRun?.endedAt !== undefined) return "completed";
  if (block.streaming || ["running", "pending", "in_progress"].includes(status ?? ""))
    return "running";
  return "neutral";
}

export function activitySummary(blocks: readonly Block[]) {
  const running = blocks.findLast((block) => activityState(block) === "running");
  const tools = blocks.filter((block) => block.role === "tool");
  const latest = running || tools.at(-1) || blocks.at(-1);
  return {
    count: tools.length || blocks.length,
    running: !!running,
    completed: tools.length > 0 && tools.every((block) => activityState(block) === "completed"),
    title: latest ? activityTitle(latest) : "",
  };
}
