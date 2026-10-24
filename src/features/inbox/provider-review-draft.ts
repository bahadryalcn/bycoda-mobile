import type { RemoteInboxReceipt, RemoteInboxReview, RemoteInboxReviewComment } from "../../../../src/features/inbox/model/remoteInbox";
import type { InboxOrigin } from "./provider-protocol";
import { inboxItemKey } from "./provider-model";
import type { RemoteInboxItem } from "../../../../src/features/inbox/model/remoteInbox";
export type PrReviewDraft = { version: 1; commitId: string; body: string; event: RemoteInboxReview["event"]; comments: RemoteInboxReviewComment[];
  pending?: { requestId: string; environmentId: string }; completed?: boolean };
export const emptyPrReviewDraft = (): PrReviewDraft => ({ version: 1, commitId: "", body: "", event: "COMMENT", comments: [] });
export const prReviewDraftKey = (origin: InboxOrigin, item: RemoteInboxItem) => `bycoda.mobile.pr-review.v1:${JSON.stringify([origin.machineId, origin.projectId, inboxItemKey(item)])}`;
export function decodePrReviewDraft(raw: string): PrReviewDraft {
  if (raw.length > 200_000) throw new Error("Invalid saved pull request review");
  const value = JSON.parse(raw) as PrReviewDraft;
  if (!value || value.version !== 1 || typeof value.commitId !== "string" || value.commitId !== "" && !/^[a-f0-9]{40}$/.test(value.commitId) ||
    typeof value.body !== "string" || value.body.length > 30_000 || value.body.includes("\0") || !["COMMENT", "APPROVE", "REQUEST_CHANGES"].includes(value.event) ||
    !Array.isArray(value.comments) || value.comments.length > 50 || value.comments.some((comment) => !comment || typeof comment.path !== "string" || !comment.path || comment.path.length > 1000 ||
      !["LEFT", "RIGHT"].includes(comment.side) || !Number.isSafeInteger(comment.line) || comment.line < 1 || comment.startLine !== undefined ||
      typeof comment.body !== "string" || comment.body.length > 30_000 || comment.body.includes("\0")) ||
    value.body.length + value.comments.reduce((sum, comment) => sum + comment.body.length, 0) > 60_000 ||
    value.pending && (typeof value.pending.requestId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(value.pending.requestId) || typeof value.pending.environmentId !== "string" || !value.pending.environmentId || value.pending.environmentId.length > 200) ||
    value.completed !== undefined && typeof value.completed !== "boolean" || value.completed && value.pending)
    throw new Error("Invalid saved pull request review");
  return value;
}
export const encodePrReviewDraft = (value: PrReviewDraft | null) => value ? JSON.stringify(value) : null;
export function sameReviewedPrDraft(draft: PrReviewDraft | null, review: RemoteInboxReview): boolean {
  return !!draft && draft.commitId === review.commitId && draft.body === review.body && draft.event === review.event && draft.comments.length === review.comments.length &&
    draft.comments.every((comment, index) => { const before = review.comments[index]; return before && comment.path === before.path && comment.line === before.line && comment.side === before.side && comment.body === before.body && comment.startLine === before.startLine; });
}
/** A missing, malformed or uncertain receipt cannot unlock a fresh send. */
export function reviewedPrReceipt(value: unknown): RemoteInboxReceipt {
  const row = value as RemoteInboxReceipt;
  if (!row || typeof row.id !== "string" || !row.id || row.id.length > 200 ||
    !["queued", "running", "completed", "failed", "uncertain"].includes(row.state) || row.error !== undefined && (typeof row.error !== "string" || row.error.length > 10_000))
    throw new Error("The review receipt could not be confirmed");
  return row;
}
export function settlePrReviewDraft(draft: PrReviewDraft, requestId: string, receipt: RemoteInboxReceipt): PrReviewDraft {
  if (draft.pending?.requestId !== requestId || !["completed", "failed"].includes(receipt.state)) return draft;
  return { ...draft, pending: undefined, ...(receipt.state === "completed" ? { completed: true } : {}) };
}
