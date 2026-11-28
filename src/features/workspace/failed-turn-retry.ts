import { executionUserIndex } from "../../../../src/features/sessions/model/executionTurn";
import { isSessionErrorBlock } from "../../../../src/features/sessions/model/sessionIssue";
import { sessionErrorPresentation } from "../../../../src/features/sessions/model/sessionErrorPresentation";
import type { RemoteAttachment } from "../../../../src/features/connections/model/protocol";
import type { Session } from "../../../../src/features/sessions/model/session";
import { captureSessionAuthority } from "@/domain/session-authority";
import type { Block, HostSession } from "./wire";

/**
 * Why a failed turn shows no Retry: admission failed before the turn existed, the turn holds content
 * the phone cannot resend as typed (operator, second opinion, note or CI context, orchestration), a
 * prompt the Host sent only as a 32 KiB preview, or an attachment that is gone.
 */
export type FailedTurnBlock = "not-sent" | "unsupported" | "truncated" | "attachments-missing";

export type FailedTurnRetry = {
  /** The failure block this Retry belongs to; its card shows the action. */
  errorId: string;
  text: string;
  attachments: RemoteAttachment[];
  intent?: "plan";
};

export type FailedTurnEvaluation =
  | { retry: FailedTurnRetry }
  | { blocked: FailedTurnBlock; errorId: string }
  | null;

export type RetrySession = Pick<HostSession, "status" | "historyLoading" | "authorityGeneration"> & {
  session: Pick<
    Session,
    | "id"
    | "blocks"
    | "usageLimit"
    | "pendingQuestion"
    | "pendingSwitch"
    | "worktreeRemoved"
    | "queuedMessages"
    | "editingQueuedMessageId"
    | "historyLoadError"
  >;
};

/** Old `/mono` and `/bycoda` command turns; the phone does not resend operator turns. */
const LEGACY_OPERATOR = /^\s*\/(?:mono|bycoda)(?=\s|$)/i;

/** The Host stores a compaction as this literal prompt; resending it as text would not compact. */
const COMPACT_TURN = /^\s*\/compact\s*$/;

/** An answer to the agent's question belongs to the running turn; it never starts one. */
const startsTurn = (block: Block) =>
  block.role === "user" && !block.internal && !block.draft && !block.questionAnswers?.length;

function lastTurnStart(blocks: readonly Block[]): number {
  for (let index = blocks.length - 1; index >= 0; index -= 1) if (startsTurn(blocks[index]!)) return index;
  return -1;
}

const lastHandoff = (blocks: readonly Block[]) => blocks.findLast((block) => block.role === "handoff");

function remoteAttachment(file: NonNullable<Block["attachments"]>[number]): RemoteAttachment {
  const { id, name, mimeType, kind, size, browserAnnotation } = file;
  return { id, name, mimeType, kind, size, ...(browserAnnotation ? { browserAnnotation } : {}) };
}

/**
 * Desktop's `evaluateFailedTurn` (RetryFailedTurn.tsx) for a Host session: only the latest submitted
 * user turn that ended in a provider error, with nothing running, queued, drafted or waiting, and
 * not a usage limit (that has its own recovery). The resend is the prompt and its attachments as
 * they were sent, never a truncated preview.
 */
export function evaluateFailedTurn(
  value: RetrySession,
  { queued = false }: { queued?: boolean } = {},
): FailedTurnEvaluation {
  const session = value.session;
  const blocks = session.blocks;
  const handoff = lastHandoff(blocks)?.handoff;
  const retryingSwitch = handoff?.status === "failed" || handoff?.status === "cancelled";
  if (
    value.status === "running" ||
    queued ||
    session.usageLimit ||
    session.pendingQuestion ||
    (session.pendingSwitch && !retryingSwitch) ||
    value.historyLoading ||
    session.historyLoadError ||
    session.worktreeRemoved ||
    session.editingQueuedMessageId ||
    session.queuedMessages?.length ||
    blocks.some((block) => block.draft)
  )
    return null;
  const last = lastTurnStart(blocks);
  if (last < 0) return null;
  // A steer continues its prompt's turn: retry the prompt with everything sent during it.
  const start = blocks[last]!.continuationOf ? executionUserIndex(blocks.slice(0, last + 1)) : last;
  if (start < 0) return null;
  const user = blocks[start]!;
  const sent = blocks.slice(start, last + 1).filter(startsTurn);
  const output = blocks.slice(start + 1);
  const error = output.findLast(isSessionErrorBlock);
  if (!error) return null;
  // Admission failed before the new user block existed; that input belongs to the composer.
  if (/^Message not sent:/i.test(error.text.trim())) return { blocked: "not-sent", errorId: error.id };
  if (
    sessionErrorPresentation(error.text).usageLimit ||
    output.some((block) => block.streaming || block.internal || (block.approval && !block.approval.decided))
  )
    return null;
  // A completed answer after the error means the turn already recovered.
  const after = output.slice(output.indexOf(error) + 1);
  if (after.some((block) => block.role === "assistant" && block.text.trim())) return null;
  if (
    sent[0] !== user ||
    user.intent === "orchestrate" ||
    sent.some(
      (block) =>
        block.secondOpinion || block.noteCard || block.ciContext || block.bycoda ||
        LEGACY_OPERATOR.test(block.text) || COMPACT_TURN.test(block.text),
    )
  )
    return { blocked: "unsupported", errorId: error.id };
  // The Host sends long blocks as a 32 KiB preview; resending it would send a cut prompt.
  if (sent.some((block) => block.remoteContent)) return { blocked: "truncated", errorId: error.id };
  const recalls = sent.filter((block) => block.text.trim() || block.attachments?.length);
  if (!recalls.length) return { blocked: "unsupported", errorId: error.id };
  const files = recalls.flatMap((block) => block.attachments ?? []);
  if (files.some((file) => file.missing)) return { blocked: "attachments-missing", errorId: error.id };
  return {
    retry: {
      errorId: error.id,
      text: recalls.map((block) => block.text).join("\n\n"),
      attachments: files.map(remoteAttachment),
      ...(user.intent === "plan" ? { intent: "plan" as const } : {}),
    },
  };
}

/** The Retry for the latest failed turn, or null when it cannot be resent. */
export function failedTurnRetry(value: RetrySession, options?: { queued?: boolean }): FailedTurnRetry | null {
  const result = evaluateFailedTurn(value, options);
  return result && "retry" in result ? result.retry : null;
}

/**
 * The resend as an ordinary `send` under the displayed session authority, exactly what the composer
 * sends for this text: the prompt is not reparsed, so its recorded intent stays.
 */
export function retryCommand(value: RetrySession, retry: FailedTurnRetry): Record<string, unknown> {
  if (value.status === "running") throw new Error("Wait for this turn, queue your message, or choose Steer.");
  return {
    type: "send",
    ...captureSessionAuthority(value),
    sessionId: value.session.id,
    text: retry.text,
    attachments: retry.attachments,
    ...(retry.intent ? { intent: retry.intent } : {}),
  };
}

/** An active limit belongs to the last failed turn, never an older quota error (desktop `usageLimitFailureId`). */
export function usageLimitFailureId(blocks: readonly Block[]): string | undefined {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]!;
    if (block.role === "user" && !block.draft && !block.internal) return undefined;
    if (isSessionErrorBlock(block)) return sessionErrorPresentation(block.text).usageLimit ? block.id : undefined;
  }
  return undefined;
}
