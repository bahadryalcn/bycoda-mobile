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
export type PrRouteTarget = { number: number; repo: string; projectPath: string };
/** Route params carry only identity; display data is read from the machine- and project-scoped list cache. */
export function readPrRoute(params: { id?: unknown; repo?: unknown; projectPath?: unknown }): PrRouteTarget | null {
  const { id, repo, projectPath } = params;
  if (typeof id !== "string" || typeof repo !== "string" || typeof projectPath !== "string" || projectPath.length > 1_024) return null;
  const number = Number(id);
  if (!Number.isSafeInteger(number) || number < 1 || String(number) !== id) return null;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return null;
  return { number, repo, projectPath };
}
/** Identity match only: the route never supplies title, state, labels or URL. */
export function matchPrItem(items: RemoteInboxItem[] | undefined, target: PrRouteTarget): RemoteInboxItem | null {
  return items?.find(item => item.provider === "github" && item.kind === "pr" && item.number === target.number &&
    item.repo === target.repo && item.projectPath === target.projectPath) ?? null;
}
