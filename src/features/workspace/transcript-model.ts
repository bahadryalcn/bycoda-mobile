import type { Block } from "./wire";

export type TranscriptEntry =
  | { id: string; kind: "message"; block: Block; author?: string }
  | { id: string; kind: "activity"; blocks: Block[]; author?: string };
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
    !block.handoff
  );
}
/** Preserve chronology and keep actionable/error content outside collapsed activity. */
export function transcriptEntries(
  blocks: readonly Block[],
  fallbackAuthor?: string,
): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  let author = fallbackAuthor;
  for (const block of blocks) {
    if (block.internal) continue;
    if (block.role === "user" && block.turnModel) author = block.turnModel.harness;
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

export function activityState(block: Block): "running" | "failed" | "completed" | "neutral" {
  const status = block.tool?.status?.toLowerCase();
  if (block.notice === "error" || ["error", "failed", "denied", "rejected"].includes(status ?? ""))
    return "failed";
  if (block.streaming || ["running", "pending", "in_progress"].includes(status ?? ""))
    return "running";
  if (["completed", "done", "success"].includes(status ?? "")) return "completed";
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
