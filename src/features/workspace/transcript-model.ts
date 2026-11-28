import {
  isOwnerStopNotice,
  isOwnerStoppedTurn,
  isTurnInterruptionNotice,
} from "../../../../src/features/sessions/model/turnInterruption";
import type { Block, HostSession } from "./wire";
import { providerName } from "./provider-choices";
import { sameTurnSummary, turnSummary, type TurnSummary } from "./transcript-turn-summary";

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
  continuation?: boolean;
  /**
   * The reply names its agent (small avatar and name): its author is not the session's agent, or
   * differs from the previous reply's, as in crew and handoff sessions. Single-agent sessions omit it.
   */
  showAuthor?: boolean;
  /** On a settled turn's folded work row: the turn's user block, whose duration the row shows. */
  foldTurn?: Block;
  /** The receipt repeats the turn's duration because no visible fold row of the turn shows it. */
  footerDuration?: boolean;
  /** A settled turn's changed files and web sources, shown after its last entry like desktop. */
  turnSummary?: TurnSummary;
};
export type TranscriptEntry =
  | ({ id: string; kind: "message"; block: Block; author?: string; /** Identical failures folded into this card. */ repeat?: number } & TurnChrome)
  | ({ id: string; kind: "activity"; blocks: Block[]; author?: string } & TurnChrome)
  /** A turn's subagent runs: one flat row, or a group under a header. Never folded into the work row. */
  | ({ id: string; kind: "agents"; blocks: Block[]; author?: string } & TurnChrome);
export type TranscriptView = "messages" | "details";

/** Older rows can grow or regroup the list without adding anything at its live end. */
export function transcriptTailStamp(entries: readonly TranscriptEntry[]) {
  const last = entries.at(-1);
  const block = last?.kind === "message" ? last.block : last?.blocks.at(-1);
  return block ? JSON.stringify([block.id, block.text?.length ?? 0, block.tool?.output?.length ?? 0]) : undefined;
}

/**
 * The owner's own Stop, and a quit marker an older Host appended right after it. When the turn's
 * receipt says "You stopped" the messages view folds the Stop away; otherwise the Stop stays as the
 * single compact "You stopped" row and only the quit marker folds. Matches through the shared
 * turn-interruption helpers only.
 */
export function isFoldedOwnerStop(previous: Block | undefined, block: Block) {
  if (block.role !== "system") return false;
  return isOwnerStoppedTurn(previous ? [previous, block] : [block]);
}

/** How a user draft reads: an in-flight Host follow-up, a failed or uncertain one, or a saved draft. */
export type UserDraftState = "pending" | "undelivered" | "uncertain" | "saved";
export function userDraftState(block: Pick<Block, "role" | "draft" | "followUpDelivery">): UserDraftState | undefined {
  if (block.role !== "user" || !block.draft) return undefined;
  return block.followUpDelivery ?? "saved";
}

/** Presentation only: folded into the turn's work row. User commands, results, notices and decisions stay separate. */
export function isTransientActivity(block: Block) {
  return (
    ["tool", "reasoning", "system"].includes(block.role) &&
    !block.agentRun &&
    !block.inlineVisual &&
    !block.branchOrigin &&
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
    !block.agentRun &&
    !block.inlineVisual &&
    !block.branchOrigin &&
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
/** Desktop's `isHandoffCoveredBySwitch`: a ready handoff whose target the previous switch row shows. */
export function isHandoffCoveredBySwitch(blocks: readonly Block[], index: number): boolean {
  const handoff = blocks[index]?.handoff;
  if (blocks[index]?.role !== "handoff" || !handoff || handoff.status !== "ready") return false;
  for (let at = index - 1; at >= 0; at -= 1) {
    const block = blocks[at]!;
    if (block.role === "handoff") return false;
    const step = block.modelSwitch?.steps.at(-1);
    if (step) return step.harness === handoff.to;
  }
  return false;
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
/**
 * A user block that starts a provider turn. A delivered steer (`continuationOf`) is part of the turn
 * it steered, as on desktop: the Host stamps that turn's start, duration and Stop on its owner.
 */
export const isTurnStart = (block: Block) =>
  block.role === "user" && !block.draft && !block.internal && !block.continuationOf;
/** A delivered steer: a user message inside the running turn, not a new one. */
const isSteer = (block: Block) => block.role === "user" && !block.draft && !block.internal && !!block.continuationOf;

/**
 * Host-recorded start of the latest turn, for the live clock. A steer carries no start of its own,
 * so the clock keeps counting from the prompt that started the turn; undefined when that prompt is
 * not loaded.
 */
export function turnStartedAt(blocks: readonly Block[] | undefined): number | undefined {
  if (!blocks) return undefined;
  const last = blocks.findLast((block) => block.role === "user" && !block.draft && !block.internal);
  if (!last) return undefined;
  let owner: Block | undefined = last;
  const seen = new Set<string>();
  for (let id = owner.continuationOf; owner && id !== undefined; id = owner?.continuationOf) {
    if (seen.has(id)) return undefined;
    seen.add(id);
    owner = blocks.findLast((block) => block.id === id && block.role === "user");
  }
  const value = owner?.startedAt;
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** What the turns before `end` leave for the next one: its model and whether a switch row followed. */
export type TurnContext = {
  model?: TurnModel;
  switched: boolean;
  /** The session's own agent, when a regrouped tail starts from another turn's author. */
  sessionAuthor?: string;
  /** Author of the last assistant reply before `end`. */
  replyAuthor?: string;
};
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
  let lastAssistant: string | undefined;
  const sessionAuthor = "sessionAuthor" in context ? context.sessionAuthor : fallbackAuthor;
  let previousReply = context.replyAuthor;
  // The turn's folded work row; like desktop, it carries the settled turn's duration.
  let turnFold: Extract<TranscriptEntry, { kind: "activity" }> | undefined;
  // The blocks of the turn being read, for its changed files and sources (desktop's per-turn strip).
  let turnBlocks: Block[] = [];
  // Like desktop, a settled turn ends with its receipt; the running turn has none yet.
  // A queued draft is not part of the turn it follows, so the receipt skips past it.
  const closeTurn = (last: boolean) => {
    const entry = entries.findLast((item) => !(item.kind === "message" && item.block.draft));
    const settled = !(last && presentation?.running);
    if (turnUser?.durationMs != null && entry && settled) {
      entry.footer = turnUser;
      if (turnFold) turnFold.foldTurn = turnUser;
      else entry.footerDuration = true;
    }
    const summary = entry && settled && turnBlocks.length ? turnSummary(turnBlocks) : undefined;
    // The settled turn's whole work replaces anything an earlier close attached to the same row.
    if (summary && entry) entry.turnSummary = summary;
    turnUser = undefined;
    turnFold = undefined;
    turnBlocks = [];
  };
  // Queued drafts and internal steering do not start a new visible provider turn; work after the
  // latest user message (a steer included) is the part still unfolding.
  const turnStart = blocks.findLastIndex(
    (block) => block.role === "user" && !block.draft && !block.internal,
  );
  // Any later user row closes the turn with its receipt; only the last turn waits while running.
  const lastTurnClose = blocks.findLastIndex((block) => block.role === "user" && !block.internal);
  const stoppedReceiptFollows = (index: number) =>
    turnUser?.durationMs != null &&
    turnUser.turnOutcome === "stopped" &&
    !(index > lastTurnClose && presentation?.running);
  // Like desktop, the messages view folds a turn's finished work into one row; failures stay visible.
  let turnWork: Extract<TranscriptEntry, { kind: "activity" }> | undefined;
  // A turn's subagents gather where its first one started; finished runs stay visible as results.
  let turnAgents: Extract<TranscriptEntry, { kind: "agents" }> | undefined;
  for (const [index, block] of blocks.entries()) {
    if (block.internal) continue;
    // Like desktop, a finished handoff the switch row above already names gets no divider of its own.
    if (isHandoffCoveredBySwitch(blocks, index)) continue;
    if (
      presentation?.view === "messages" &&
      isFoldedOwnerStop(blocks[index - 1], block) &&
      (!isOwnerStopNotice(block) || stoppedReceiptFollows(index))
    )
      continue;
    if (block.modelSwitch) switched = true;
    if (block.role === "user") {
      // A steer or queued draft stays inside its turn (work keeps arriving after a queued
      // follow-up), so the turn's receipt and changed files still follow the turn's end.
      if (!isSteer(block) && !block.draft) closeTurn(false);
      lastAssistant = undefined;
    }
    if (block.modelSwitch) lastAssistant = undefined;
    if (block.role === "user" && !block.draft) {
      turnWork = undefined;
      turnAgents = undefined;
    }
    if (block.role === "user" && block.turnModel) author = block.turnModel.harness;
    let chrome: TurnChrome = {};
    turnBlocks.push(block);
    if (isTurnStart(block)) {
      turnUser = block;
      if (block.turnModel && previousModel && !switched && !sameModel(previousModel, block.turnModel))
        chrome = { modelChange: { from: previousModel, to: block.turnModel } };
      previousModel = block.turnModel ?? previousModel;
      switched = false;
    } else if (block.role === "assistant") {
      const modelName = turnUser?.turnModel?.name;
      const sender = JSON.stringify([author, modelName, block.author]);
      const continuation = lastAssistant === sender;
      const showAuthor =
        !continuation &&
        !!author &&
        (author !== sessionAuthor || (previousReply !== undefined && previousReply !== author));
      chrome = {
        ...(modelName ? { modelName } : {}),
        ...(continuation ? { continuation: true } : {}),
        ...(showAuthor ? { showAuthor: true } : {}),
      };
      lastAssistant = sender;
      previousReply = author;
    }
    if (block.agentRun) {
      if (turnAgents && !turnAgents.footer) turnAgents.blocks.push(block);
      else {
        turnAgents = { id: `agents:${block.id}`, kind: "agents", blocks: [block], author };
        entries.push(turnAgents);
      }
      continue;
    }
    if (presentation?.view === "messages" && isTransientActivity(block) && activityState(block) !== "failed") {
      // Like a work log, the live turn keeps each step where it happened: consecutive steps
      // share one growing row whose id never changes, so a finished step neither vanishes nor moves
      // to the top of the turn. The settled turn folds into one row below, as on desktop.
      if (presentation.running && index > turnStart) {
        const previous = entries.at(-1);
        if (previous?.kind === "activity" && !previous.footer && previous.id.startsWith("live:")) previous.blocks.push(block);
        else entries.push({ id: `live:${block.id}`, kind: "activity", blocks: [block], author });
        continue;
      }
      if (turnWork) turnWork.blocks.push(block);
      else {
        turnWork = { id: `work:${block.id}`, kind: "activity", blocks: [block], author };
        // Work after a steer starts its own row; the turn's first row keeps the duration.
        if (turnUser && !turnFold) turnFold = turnWork;
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

function sameEntry(previous: TranscriptEntry, next: TranscriptEntry) {
  if (previous === next) return true;
  const keys = Object.keys(next);
  if (keys.length !== Object.keys(previous).length) return false;
  for (const key of keys) {
    const a: unknown = (previous as Record<string, unknown>)[key];
    const b: unknown = (next as Record<string, unknown>)[key];
    if (a === b) continue;
    if (key === "blocks") {
      const left = a as readonly Block[] | undefined;
      const right = b as readonly Block[] | undefined;
      if (!left || !right || left.length !== right.length || left.some((block, index) => block !== right[index])) return false;
    } else if (key === "turnSummary") {
      if (!sameTurnSummary(a as TurnSummary | undefined, b as TurnSummary | undefined)) return false;
    } else if (key === "modelChange") {
      const left = a as TurnChrome["modelChange"];
      const right = b as TurnChrome["modelChange"];
      if (!left || !right || left.from !== right.from || left.to !== right.to) return false;
    } else return false;
  }
  return true;
}

/**
 * Structural sharing for derived transcript entries: an entry equal to the previous one with the
 * same id (same blocks, chrome and footer) is returned as that previous object, so memoized rows
 * skip it. Returns `previous` itself when nothing changed.
 */
export function shareEntries(previous: readonly TranscriptEntry[], next: TranscriptEntry[]): TranscriptEntry[] {
  if (!previous.length) return next;
  let byId: Map<string, TranscriptEntry> | undefined;
  let changed = previous.length !== next.length;
  const out = next.map((entry, index) => {
    let candidate: TranscriptEntry | undefined = previous[index];
    if (candidate?.id !== entry.id) candidate = (byId ??= new Map(previous.map((item) => [item.id, item]))).get(entry.id);
    if (candidate && sameEntry(candidate, entry)) {
      if (candidate !== previous[index]) changed = true;
      return candidate;
    }
    changed = true;
    return entry;
  });
  return changed ? out : (previous as TranscriptEntry[]);
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
      if (block && isTurnStart(block)) break;
      start--;
    }
    const boundary = compatible && start > 0 ? this.entries.findIndex((entry) => entry.kind === "message" && entry.block === blocks[start]) : 0;
    if (boundary < 0) start = 0;
    const prefix = boundary > 0 ? this.entries.slice(0, boundary) : [];
    const tail = transcriptEntries(
      blocks.slice(start),
      prefix.at(-1)?.author ?? author,
      presentation,
      prefix.length
        ? {
            ...turnContextBefore(blocks, start),
            sessionAuthor: author,
            replyAuthor: prefix.findLast((entry) => entry.kind === "message" && entry.block.role === "assistant")?.author,
          }
        : undefined,
    );
    // Regrouping the live turn rebuilds its entries; unchanged ones keep their identity so their rows bail out.
    this.entries = prefix.concat(compatible ? shareEntries(this.entries.slice(prefix.length), tail) : tail);
    this.blocks = blocks;
    this.author = author;
    this.view = presentation?.view;
    this.running = !!presentation?.running;
    return this.entries;
  }
}

/** A delivered outbox message keeps its bubble this long while the Host's block has not arrived. */
export const DELIVERED_GRACE_MS = 120_000;

type OutboxBubbleRow = {
  id: string;
  status: string;
  createdAt: number;
  mode?: string;
  /** When this screen first saw the row delivered; the grace counts from here. */
  deliveredAt?: number;
};

/**
 * Outbox messages still worth a bubble. The Host writes a sent message as a user block whose id is the
 * command id the outbox row carries (lower-cased), so a row is reconciled by that id, never by text:
 * once the block exists the row is gone, and a delivered row bridges the gap until it does or the
 * grace ends. A delivered queue row belongs to the queue panel, not the conversation.
 */
export function pendingOutboxRows<Row extends OutboxBubbleRow>(
  rows: readonly Row[],
  blocks: readonly Pick<Block, "id">[] | undefined,
  now = Date.now(),
): Row[] {
  const ids = new Set((blocks ?? []).map((block) => block.id.toLowerCase()));
  return rows.filter((row) => {
    if (ids.has(row.id.toLowerCase())) return false;
    if (row.status !== "delivered") return true;
    if (row.mode === "queue") return false;
    const since = row.deliveredAt ?? row.createdAt;
    return now >= since && now - since < DELIVERED_GRACE_MS;
  });
}

/**
 * The transcript's in-memory copy of rows it saw delivered. Custody removes a delivered row right
 * after dispatch, usually before the Host's block arrives; the remembered copy keeps the bubble until
 * `pendingOutboxRows` reconciles it by id or the grace ends. Stored rows always win, nothing is
 * written back, and the caller forgets a row the owner deleted. Returns stored plus remembered rows.
 */
export function bridgeDeliveredOutboxRows<Row extends OutboxBubbleRow>(
  remembered: Map<string, Row>,
  rows: readonly Row[],
  now = Date.now(),
): Row[] {
  const stored = new Set<string>();
  for (const row of rows) {
    stored.add(row.id);
    if (row.status === "delivered" && row.mode !== "queue" && !remembered.has(row.id))
      remembered.set(row.id, { ...row, deliveredAt: now });
  }
  const bridged: Row[] = [];
  for (const [id, row] of remembered) {
    if (now - (row.deliveredAt ?? row.createdAt) >= DELIVERED_GRACE_MS) remembered.delete(id);
    else if (!stored.has(id)) bridged.push(row);
  }
  const current = rows.map((row) => (row.status === "delivered" ? (remembered.get(row.id) ?? row) : row));
  if (!bridged.length) return current;
  // Sending order: a removed delivered row still reads before the ones that followed it.
  return [...current, ...bridged].sort((a, b) => a.createdAt - b.createdAt);
}

/** Why an outbox bubble is not simply on its way; mirrors the outbox notice kinds. */
export type OutboxBubbleNotice = "foreign" | "unavailable" | "expired" | "blocked" | "waiting";

/**
 * How one outbox bubble reads. The composer writes its row ahead of the send as `blocked` and holds
 * the session's outbox lock until the Host answers; that row is the message in flight, so it sweeps
 * like any just-sent message and says nothing, offers no Retry (the send is still running) and no
 * Edit or Delete (both wait for the lock); a delivered bridge looks the same until the Host's block
 * replaces it. A queued message in flight is the queue's, never a
 * conversation bubble. Without the lock a `blocked` row really stopped and says why.
 */
export function outboxBubble(
  row: { status: string; mode?: string; createdAt: number; blockedReason?: string },
  input: {
    notice: OutboxBubbleNotice;
    /** The session's outbox lock is held (a send or a replay is running). */
    locked: boolean;
    /** The newest row of the session. */
    newest: boolean;
    now: number;
    sweepMs: number;
  },
): {
  hidden: boolean;
  /** Still on its way, so its words may sweep (the caller lets only the latest bubble move). */
  pending: boolean;
  caption?: OutboxBubbleNotice;
  retry: boolean;
  /** Edit and Delete are available. */
  actions: boolean;
} {
  const inFlight = input.locked && input.newest && row.status === "blocked" && !row.blockedReason;
  if (inFlight) return { hidden: row.mode === "queue", pending: true, retry: false, actions: false };
  // Delivered: the Host's block replaces it in a moment, so it keeps the in-flight look (no menu
  // appearing for that moment).
  if (row.status === "delivered") return { hidden: false, pending: true, retry: false, actions: false };
  const stale = input.now - row.createdAt >= input.sweepMs;
  const waiting = input.notice === "waiting";
  return {
    hidden: false,
    pending: waiting,
    ...(waiting && !stale ? {} : { caption: input.notice }),
    retry: row.status !== "dropped" && (!waiting || stale),
    actions: true,
  };
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
    if (block.role !== "assistant" || !block.text) continue;
    // A long block is only a 32 KiB preview here; a cut response is never offered as complete.
    if (block.remoteContent) return undefined;
    text.push(block.text);
  }
  return text.join("\n\n");
}

/** "mcp__workspace-tools__delegate_task" reads as "delegate task": drop the server prefix and underscores. */
export function readableToolName(name: string) {
  const tool = /^mcp__.+?__(.+)$/.exec(name)?.[1];
  return tool ? tool.replace(/_+/g, " ").trim() || name : name;
}

export function activityTitle(block: Block) {
  const title = block.agentRun?.name || block.tool?.title || block.text || block.tool?.detail || "";
  return readableToolName(title.replace(/\s+/g, " ").trim());
}

/** Keep the actual operation visible when a shell command starts with a working directory. */
export function activityListTitle(block: Block) {
  const title = activityTitle(block);
  if (block.role !== "tool") return title;
  const command = /^cd\s+(?:"(?:\\.|[^"\\])*"|'[^']*'|[^\s&;"']+)\s*&&\s*(.+)$/.exec(title)?.[1];
  return command ?? title;
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

export type AgentRunState = ReturnType<typeof activityState> | "queued" | "cancelled";

/** Agent surfaces name queued and cancelled work; transcript grouping keeps the coarser activity state. */
export function agentRunState(block: Block): AgentRunState {
  const state = activityState(block);
  const status = block.tool?.status?.toLowerCase();
  if (state === "failed" && block.notice !== "error" && (status === "cancelled" || status === "canceled"))
    return "cancelled";
  if (state === "neutral" && status === "queued") return "queued";
  if (state === "running" && status === "pending" && !block.streaming && block.agentRun?.startedAt === undefined)
    return "queued";
  return state;
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

/**
 * While the footer offers Continue for a cut-off turn, the trailing interruption notice it stands for
 * leaves the list; its receipt moves to the entry before it.
 */
export function withoutOfferedInterruption(entries: TranscriptEntry[]): TranscriptEntry[] {
  const last = entries.at(-1);
  if (last?.kind !== "message" || !isTurnInterruptionNotice(last.block)) return entries;
  const out = entries.slice(0, -1);
  const previous = out.at(-1);
  if (previous && ((last.footer && !previous.footer) || (last.turnSummary && !previous.turnSummary)))
    out[out.length - 1] = {
      ...previous,
      ...(last.footer && !previous.footer ? { footer: last.footer, ...(last.footerDuration ? { footerDuration: true } : {}) } : {}),
      ...(last.turnSummary && !previous.turnSummary ? { turnSummary: last.turnSummary } : {}),
    };
  return out;
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
