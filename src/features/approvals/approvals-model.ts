import type { ApprovalView } from "../../../../src/shared/model/host-contracts/approvals";

export type { ApprovalView };
export const APPROVALS_CAPABILITY = "approvals";
const STATUSES = ["pending", "approved", "denied", "expired"] as const;

/** Keeps only entries with every field the screen and a decision depend on; a malformed entry is dropped, never guessed. */
export function parseApprovals(raw: unknown): ApprovalView[] {
  const list = (raw as { approvals?: unknown } | null)?.approvals;
  if (!Array.isArray(list)) return [];
  return list.filter((entry): entry is ApprovalView => {
    const value = entry as Partial<ApprovalView> | null;
    return (
      !!value &&
      typeof value.id === "string" &&
      !!value.id &&
      typeof value.title === "string" &&
      typeof value.message === "string" &&
      typeof value.confirmLabel === "string" &&
      typeof value.cancelLabel === "string" &&
      typeof value.deadline === "number" &&
      typeof value.remote === "boolean" &&
      typeof value.signature === "string" &&
      (STATUSES as readonly unknown[]).includes(value.status)
    );
  });
}

/** An entry the owner can still answer: pending and not past its deadline. */
export const approvalOpen = (approval: ApprovalView, now: number) =>
  approval.status === "pending" && approval.deadline > now;

export const pendingApprovalCount = (approvals: ApprovalView[], now: number) =>
  approvals.filter((approval) => approvalOpen(approval, now)).length;

/** Pending first (the focused one on top, then soonest deadline), then settled newest first. */
export function sortApprovals(approvals: ApprovalView[], focusId?: string): ApprovalView[] {
  const rank = (approval: ApprovalView) => (approval.status === "pending" ? 0 : 1);
  return [...approvals].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.status === "pending"
        ? Number(b.id === focusId) - Number(a.id === focusId) || a.deadline - b.deadline
        : (b.decidedAt ?? b.deadline) - (a.decidedAt ?? a.deadline)),
  );
}

/** m:ss until the deadline, or null once it has passed. */
export function remainingTime(deadline: number, now: number): string | null {
  const seconds = Math.ceil((deadline - now) / 1000);
  if (seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
