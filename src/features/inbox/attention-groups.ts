import type { MobileInboxItem } from "@/domain/types";

const urgentStatuses = ["review", "awaiting-approval", "blocked", "failed"];
const finishedStatuses = ["done", "succeeded", "completed", "finished"];

export type AttentionIcon = "approval" | "failure" | "review" | "finished" | "question" | "pull-request";

export function isUrgentAttention(item: Pick<MobileInboxItem, "status">): boolean {
  return !!item.status && urgentStatuses.includes(item.status);
}

/** Icon kind follows what the item asks of the owner, then falls back to its source. */
export function attentionIcon(item: Pick<MobileInboxItem, "status" | "kind">): AttentionIcon {
  const status = item.status ?? "";
  if (status === "awaiting-approval") return "approval";
  if (status === "failed" || status === "blocked") return "failure";
  if (status === "review") return "review";
  if (finishedStatuses.includes(status)) return "finished";
  return item.kind === "pull-request" ? "pull-request" : "question";
}

/** Urgent items first; order inside each group is kept. */
export function groupAttention<T extends Pick<MobileInboxItem, "status">>(items: readonly T[]) {
  const now = items.filter(isUrgentAttention);
  const earlier = items.filter((item) => !isUrgentAttention(item));
  return { now, earlier, ordered: [...now, ...earlier] };
}
