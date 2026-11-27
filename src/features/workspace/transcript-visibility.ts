import type { ToolVisibility } from "@/ui/chat-display-model";
import { activityState, isTurnStart as isTurnStartBlock, shareEntries, type TranscriptEntry } from "./transcript-model";
import type { Block } from "./wire";

/**
 * A tool call or reasoning record that is not an owner decision, plan, result card or attachment.
 * A subagent run is a result the owner follows, so tool visibility never hides it.
 */
export function isToolRecord(block: Block) {
  return (
    (block.role === "tool" || block.role === "reasoning") &&
    !block.agentRun &&
    !block.approval &&
    !block.interjection &&
    !block.plan &&
    !block.taskList &&
    !block.draft &&
    !block.orchestration &&
    !block.handoff &&
    !block.noteCard &&
    !block.secondOpinion &&
    !block.modelSwitch &&
    !block.attachments?.length &&
    !block.image
  );
}

const failedRecord = (block: Block) =>
  activityState(block) === "failed" ||
  !!block.shell?.timedOut ||
  (block.shell?.exitCode !== undefined && block.shell.exitCode !== 0);
/** Hidden by "Hide successful": finished without failure; running work stays visible. */
const successfulRecord = (block: Block) => isToolRecord(block) && !failedRecord(block) && activityState(block) !== "running";

/** A steer belongs to the turn it steered, so it never splits a turn here either. */
const isTurnStart = (entry: TranscriptEntry) => entry.kind === "message" && isTurnStartBlock(entry.block);

/** Chrome a dropped entry carried (turn receipt) moves to the nearest kept entry of its turn. */
function withFooter(out: TranscriptEntry[], dropped: TranscriptEntry) {
  if (!dropped.footer) return;
  const last = out.at(-1);
  if (last && !last.footer) out[out.length - 1] = { ...last, footer: dropped.footer };
}

/**
 * Applies the owner's tool-call visibility to the grouped transcript. Presentation only: the blocks,
 * activity inspector and copy/search keep reading the full session. Approvals, questions, notices
 * and plans never hide. `running` keeps the live turn's activity visible as one compact row in Zen.
 */
export function applyToolVisibility(entries: TranscriptEntry[], mode: ToolVisibility, running: boolean): TranscriptEntry[] {
  if (mode === "all") return entries;
  return withFoldDurations(filterToolVisibility(entries, mode, running));
}

/**
 * A settled turn shows its duration once: on its fold row, or on its receipt when filtering hid the
 * fold row. Entries whose receipt must now carry it are copied; equal ones are shared later.
 */
export function withFoldDurations(entries: TranscriptEntry[]): TranscriptEntry[] {
  let turnStart = 0;
  for (let index = 0; index <= entries.length; index++) {
    if (index < entries.length && !(isTurnStart(entries[index]!) && index > turnStart)) continue;
    let folded = false;
    for (let position = turnStart; position < index; position++) {
      const entry = entries[position]!;
      if (entry.kind === "activity" && entry.foldTurn) folded = true;
    }
    if (!folded)
      for (let position = turnStart; position < index; position++) {
        const entry = entries[position]!;
        if (entry.footer && !entry.footerDuration) entries[position] = { ...entry, footerDuration: true };
      }
    turnStart = index;
  }
  return entries;
}

function filterToolVisibility(entries: TranscriptEntry[], mode: Exclude<ToolVisibility, "all">, running: boolean): TranscriptEntry[] {
  const out: TranscriptEntry[] = [];
  const keep = (entry: TranscriptEntry) => out.push(entry);
  if (mode === "hide-successful" || mode === "hide-all") {
    const hidden = mode === "hide-all" ? isToolRecord : successfulRecord;
    for (const entry of entries) {
      if (entry.kind === "message") {
        if (hidden(entry.block)) withFooter(out, entry);
        else keep(entry);
        continue;
      }
      const blocks = entry.blocks.filter((block) => !hidden(block));
      if (blocks.length === entry.blocks.length) keep(entry);
      else if (blocks.length) keep({ ...entry, blocks });
      else withFooter(out, entry);
    }
    return out;
  }
  // Zen: user messages and each turn's final answer; the running turn keeps one live activity row.
  let turnStart = 0;
  for (let index = 0; index <= entries.length; index++) {
    if (index < entries.length && !(isTurnStart(entries[index]!) && index > turnStart)) continue;
    const turn = entries.slice(turnStart, index);
    const lastTurn = index === entries.length;
    const finalAnswer = turn.findLast((entry) => entry.kind === "message" && entry.block.role === "assistant");
    const live = lastTurn && running ? turn.findLast((entry) => entry.kind === "activity") : undefined;
    for (const entry of turn) {
      if (entry.kind === "agents") keep(entry);
      else if (entry.kind === "activity") {
        if (entry === live) keep({ ...entry, blocks: entry.blocks.slice(-1) });
        else withFooter(out, entry);
      } else if (isToolRecord(entry.block) || (entry.block.role === "assistant" && entry !== finalAnswer && !(lastTurn && running))) {
        withFooter(out, entry);
      } else keep(entry);
    }
    turnStart = index;
  }
  return out;
}

/**
 * Owns the derived visible list across stream deltas. Filtering copies entries whose blocks or
 * receipt moved; entries equal to the previous output keep their identity so settled rows bail out.
 */
export class ToolVisibilityPresentation {
  private entries: TranscriptEntry[] = [];
  private mode?: ToolVisibility;
  update(entries: TranscriptEntry[], mode: ToolVisibility, running: boolean): TranscriptEntry[] {
    const next = applyToolVisibility(entries, mode, running);
    const shared = mode === "all" || mode !== this.mode ? next : shareEntries(this.entries, next);
    this.entries = shared;
    this.mode = mode;
    return shared;
  }
}
