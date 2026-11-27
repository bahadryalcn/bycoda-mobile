import type { RemoteInboxItem, RemoteInboxQuery } from "../../../../../src/features/inbox/model/remoteInbox";
import { applyInboxView, defaultInboxView, inboxFetchState, PULL_REQUEST_PROVIDERS, type InboxView } from "../../inbox/provider-view-model";
/**
 * The Pull requests list is the desktop's pull-request-only Inbox: the code hosts' pull and merge
 * requests with the same filter set. Assigned to me, the open/all read and search go to the
 * desktop; provider, status, repository, time and sort narrow the returned rows on the phone.
 */
export type PrFilters = { view: InboxView; assigned: boolean; search: string };
export const defaultPrFilters: PrFilters = { view: { ...defaultInboxView, type: "pr" }, assigned: false, search: "" };
export function prListQuery(filters: PrFilters): RemoteInboxQuery {
  return { providers: [...PULL_REQUEST_PROVIDERS], githubKinds: ["pr"], state: inboxFetchState(filters.view.statuses),
    assignedToMe: filters.assigned, search: filters.search };
}
/**
 * A link to a GitHub pull request the default list does not hold: every state in its repository,
 * most recently updated first. Identity is still matched exactly against the result.
 */
export function prRouteFallbackQuery(target: { repo: string } | null): RemoteInboxQuery {
  return { providers: ["github"], githubKinds: ["pr"], state: "all", assignedToMe: false,
    search: [target ? `repo:${target.repo}` : "", "sort:updated-desc"].filter(Boolean).join(" ") };
}
/** How long an unwatched list stays cached: reopening the page shows it at once while it refreshes. */
export const PR_LIST_CACHE_MS = 30 * 60_000;
/**
 * A previous read stands in while the next one loads only for the same project: its rows are
 * narrowed by the same local filters, so they never show a state the new choice excludes.
 */
export function prListKeepsPrevious(previous: { projectId?: string; query?: RemoteInboxQuery } | undefined, projectId: string): boolean {
  return !!previous?.query && previous.projectId === projectId;
}
/** Pull and merge requests only, narrowed and ordered by the shared Inbox view. */
export function prListItems(items: readonly RemoteInboxItem[], view: InboxView): RemoteInboxItem[] {
  return applyInboxView(items.filter(item => item.kind === "pr" && PULL_REQUEST_PROVIDERS.includes(item.provider)), { ...view, type: "pr" });
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
