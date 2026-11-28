import type {
  CheckpointStatus,
  CheckpointFileDiff,
} from "../../../../src/features/sessions/model/checkpoint-types";
import type { Block, HostSession } from "./wire";
import { fullContentBlock } from "./full-content-model";
import { canRewindConversation } from "../../../../src/features/sessions/model/conversationRewind";
import { captureSessionAuthority, type SessionAuthority } from "@/domain/session-authority";

export type ReviewedCheckpoint = CheckpointStatus & { expectedCheckpoint?: string };
export type ReviewedCheckpointDiff = CheckpointFileDiff & { expectedCheckpoint?: string };
export type CheckpointTarget = { machineId: string; sessionId: string; cwd: string };

export function checkpointRead(target: CheckpointTarget, relative?: string) {
  if (!target.cwd || !target.sessionId) throw new Error("Checkpoint identity is unavailable.");
  return {
    command: relative === undefined ? "session_checkpoint_status" : "session_checkpoint_file_diff",
    args: {
      sessionId: target.sessionId,
      cwd: target.cwd,
      ...(relative === undefined ? {} : { relative }),
    },
  };
}

export function checkpointChange(
  target: CheckpointTarget,
  status: ReviewedCheckpoint,
  relative: string,
  undo: boolean,
) {
  const file = status.files.find((entry) => entry.relative === relative);
  if (
    !status.expectedCheckpoint ||
    !/^[a-f0-9]{64}$/.test(status.expectedCheckpoint) ||
    !file ||
    (undo && !file.undoable)
  )
    throw new Error("Review the current checkpoint before changing files.");
  return {
    command: undo ? "session_checkpoint_undo" : "session_checkpoint_keep",
    args: {
      ...checkpointRead(target).args,
      relative,
      expectedCheckpoint: status.expectedCheckpoint,
    },
  };
}

export type RewindReview = {
  sessionId: string;
  revision: number;
  blockId: string;
  affectedIds: string[];
  prompt: string;
  cwd: string;
  runId?: string;
} & SessionAuthority;
/**
 * `full` is the message's whole block when the transcript holds only the Host's preview of it; the
 * prompt that returns to the composer is never the cut preview.
 */
export function reviewRewind(value: HostSession, blockId: string, full?: Block): RewindReview {
  const target = rewindTarget(value, blockId);
  const message = fullContentBlock(value.session.blocks[target.index]!, full);
  if (!message) throw new Error("Load the full message before editing from it.");
  return { ...target.review, prompt: message.text };
}
function rewindTarget(value: HostSession, blockId: string) {
  if (value.status === "running" || !canRewindConversation(value.session, blockId))
    throw new Error("This session cannot be rewound at that message.");
  const index = value.session.blocks.findIndex((block) => block.id === blockId);
  return {
    index,
    review: {
      ...captureSessionAuthority(value),
      sessionId: value.session.id,
      revision: value.revision,
      blockId,
      affectedIds: value.session.blocks.slice(index).map((block) => block.id),
      cwd: value.session.worktreeCwd || value.session.cwd || "",
      runId: value.runId,
    },
  };
}
export function rewindCommand(value: HostSession, review: RewindReview) {
  const latest = rewindTarget(value, review.blockId).review;
  if (
    latest.sessionId !== review.sessionId ||
    latest.revision !== review.revision ||
    latest.cwd !== review.cwd ||
    latest.runId !== review.runId ||
    JSON.stringify(latest.affectedIds) !== JSON.stringify(review.affectedIds)
  )
    throw new Error("The session changed. Review the affected messages again.");
  return {
    ...captureSessionAuthority(review),
    type: "rewind",
    sessionId: value.session.id,
    blockId: review.blockId,
    expectedRevision: review.revision,
  };
}

export function validateCheckpointStatus(value: unknown): ReviewedCheckpoint {
  const status = value as ReviewedCheckpoint;
  if (
    !status ||
    !Array.isArray(status.files) ||
    status.files.length > 2000 ||
    (status.expectedCheckpoint !== undefined &&
      !/^[a-f0-9]{64}$/.test(status.expectedCheckpoint)) ||
    !status.files.every(
      (file) =>
        file &&
        typeof file.relative === "string" &&
        typeof file.status === "string" &&
        typeof file.undoable === "boolean" &&
        typeof file.exact === "boolean" &&
        Number.isFinite(file.additions) &&
        Number.isFinite(file.deletions),
    )
  )
    throw new Error("Invalid checkpoint status response.");
  return status;
}

export function validateCheckpointDiff(value: unknown, relative: string): ReviewedCheckpointDiff {
  const diff = value as ReviewedCheckpointDiff;
  if (
    !diff ||
    diff.relative !== relative ||
    typeof diff.original !== "string" ||
    typeof diff.current !== "string" ||
    typeof diff.binary !== "boolean" ||
    typeof diff.tooLarge !== "boolean" ||
    diff.original.length + diff.current.length > 17 * 1024 * 1024 ||
    (diff.expectedCheckpoint !== undefined && !/^[a-f0-9]{64}$/.test(diff.expectedCheckpoint))
  )
    throw new Error("Invalid checkpoint diff response.");
  return diff;
}

export function checkpointReviewMatches(status: ReviewedCheckpoint, diff: ReviewedCheckpointDiff) {
  return (
    !!status.expectedCheckpoint &&
    status.expectedCheckpoint === diff.expectedCheckpoint &&
    status.files.some((file) => file.relative === diff.relative)
  );
}
