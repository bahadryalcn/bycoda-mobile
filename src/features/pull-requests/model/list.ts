import type { RemoteInboxItem, RemoteInboxQuery } from "../../../../../src/features/inbox/model/remoteInbox";
export type PrFilters = { state: "open" | "closed" | "merged"; mine: boolean; reviewRequested: boolean; sort: "updated" | "created" | "oldest" };
export const defaultPrFilters: PrFilters = { state: "open", mine: false, reviewRequested: false, sort: "updated" };
export function prListQuery(filters: PrFilters): RemoteInboxQuery {
  return { providers: ["github"], githubKinds: ["pr"], state: filters.state === "open" ? "open" : "all", assignedToMe: false,
    search: [`is:${filters.state === "closed" ? "closed is:unmerged" : filters.state}`, filters.mine ? "author:@me" : "", filters.reviewRequested ? "review-requested:@me" : "", `sort:${filters.sort === "updated" ? "updated-desc" : filters.sort === "created" ? "created-desc" : "created-asc"}`].filter(Boolean).join(" ") };
}
export function prListItems(items: RemoteInboxItem[], filters: PrFilters): RemoteInboxItem[] {
  return items.filter(item => item.provider === "github" && item.kind === "pr" && item.state.toLowerCase() === filters.state).sort((a, b) => {
    const date = (item: RemoteInboxItem) => Date.parse(filters.sort === "updated" ? item.updatedAt : item.createdAt ?? "") || 0;
    return (date(b) - date(a)) * (filters.sort === "oldest" ? -1 : 1);
  });
}
export function isTestFile(path: string): boolean {
  return /(^|\/)(__tests__|tests?|specs?|fixtures)(\/|$)|[._-](test|spec)\.[^/]+$|(^|\/)(test_|spec_)[^/]+\.[^/]+$/i.test(path);
}
export function isBotActivity(author: string): boolean { return /\[bot\]$|^bot$|^github-actions$/i.test(author); }
/** Navigation snapshots are display data; Host validates every operation's target again. */
export function readPrRoute(serialized: unknown, id: unknown): RemoteInboxItem | null {
  if (typeof serialized !== "string" || serialized.length > 20_000) return null;
  try {
    const item = JSON.parse(serialized) as RemoteInboxItem;
    if (item.provider !== "github" || item.kind !== "pr" || !Number.isSafeInteger(item.number) || item.number < 1 || String(item.number) !== id ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(item.repo) || typeof item.projectPath !== "string" || typeof item.title !== "string" || typeof item.state !== "string" || typeof item.draft !== "boolean" || typeof item.updatedAt !== "string" || typeof item.url !== "string" || !Array.isArray(item.labels) || !Array.isArray(item.assignees)) return null;
    if (item.labels.some(label => !label || typeof label.name !== "string" || typeof label.color !== "string") ||
      item.assignees.some(assignee => !assignee || typeof assignee.login !== "string" || assignee.avatarUrl !== undefined && typeof assignee.avatarUrl !== "string")) return null;
    return item;
  } catch { return null; }
}
