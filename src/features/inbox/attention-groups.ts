import type { MobileInboxItem } from "@/domain/types";

/**
 * The Host still sends Social attention items, but the phone does not manage Social.
 * Every surface that lists, counts or marks attention items seen goes through this filter.
 */
export function phoneAttentionItems<T extends Pick<MobileInboxItem, "kind">>(items: readonly T[]): T[] {
  return items.filter((item) => item.kind !== "social");
}

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

const attentionPriority = (status?: string) => status === "awaiting-approval" ? 0
  : status === "failed" || status === "blocked" ? 1 : 2;

/** Owner approvals, recovery, then reviews; preserve source order among peers. */
export function groupAttention<T extends Pick<MobileInboxItem, "status">>(items: readonly T[]) {
  const now = items.filter(isUrgentAttention).sort((left, right) => attentionPriority(left.status) - attentionPriority(right.status));
  const earlier = items.filter((item) => !isUrgentAttention(item));
  return { now, earlier, ordered: [...now, ...earlier] };
}
