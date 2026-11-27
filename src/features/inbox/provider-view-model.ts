import type { RemoteInboxItem, RemoteInboxProvider } from "../../../../src/features/inbox/model/remoteInbox";

/** The desktop Inbox's provider order. */
export const PROVIDER_ORDER: readonly RemoteInboxProvider[] = ["github", "gitlab", "azuredevops", "linear", "jira"];

export type InboxTypeFilter = "all" | "issue" | "pr";
/** Desktop status categories: open, draft, closed and merged (trackers have open and closed). */
export type InboxStatusCategory = "open" | "draft" | "closed" | "merged";
export type InboxTimeFilter = "all" | "today" | "7d" | "30d";
/** The desktop's sort choices: Recently updated and Title. */
export type InboxSort = "updated" | "title";

/**
 * What the phone narrows locally: the desktop Inbox filter menu's set (InboxFiltersMenu and
 * inboxFilters.ts). Assigned to me, the open/all read and search go to the desktop; these refine
 * the returned rows without a new read. Each list holds the chosen values; empty means all.
 */
export type InboxView = {
  provider: "all" | RemoteInboxProvider;
  type: InboxTypeFilter;
  statuses: InboxStatusCategory[];
  time: InboxTimeFilter;
  sort: InboxSort;
  /** Code host repositories (the desktop's Local repositories / Projects). */
  repos: string[];
  /** Linear teams and Jira projects (both are `teamId` on the row). */
  teams: string[];
  /** Linear projects; LINEAR_NO_PROJECT stands for issues outside every project. */
  trackerProjects: string[];
  /** Jira assignees (account id, or the name an older desktop sends) and Unassigned. */
  assignees: string[];
  unassigned: boolean;
  /** Jira workflow status names, independent of the Open/Closed categories. */
  workflow: string[];
};
export const defaultInboxView: InboxView = { provider: "all", type: "all", statuses: [], time: "all", sort: "updated",
  repos: [], teams: [], trackerProjects: [], assignees: [], unassigned: false, workflow: [] };
/** The desktop's stand-in for "no Linear project". */
export const LINEAR_NO_PROJECT = "~none";

/** A remembered or older view with every field present and only known values (sort "created" became "updated"). */
export function normalizeInboxView(value: Partial<InboxView> | undefined): InboxView {
  const list = (entry: unknown) => Array.isArray(entry) ? entry.filter((one): one is string => typeof one === "string" && !!one) : [];
  const view = { ...defaultInboxView, ...value };
  return { ...view, sort: view.sort === "title" ? "title" : "updated", repos: list(view.repos), teams: list(view.teams),
    trackerProjects: list(view.trackerProjects), assignees: list(view.assignees), workflow: list(view.workflow),
    statuses: list(view.statuses) as InboxStatusCategory[], unassigned: view.unassigned === true };
}

/** The desktop's inboxFetchState: no status chosen means every state; Closed or Merged need every state too. */
export function inboxFetchState(statuses: readonly InboxStatusCategory[]): "open" | "all" {
  if (statuses.includes("closed") || statuses.includes("merged")) return "all";
  return statuses.includes("open") || statuses.includes("draft") ? "open" : "all";
}

const isTracker = (item: Pick<RemoteInboxItem, "provider">) => item.provider === "jira" || item.provider === "linear";
/** Jira's assignee identity: the stable account id when the desktop sends one, else the display name. */
export const jiraAssigneeKey = (person: { login: string; accountId?: string }) => person.accountId || person.login;

const CLOSED_WORDS = /\b(done|closed|resolved|cancel+ed|complete[d]?|rejected|won'?t do|declined)\b/i;
const ACTIVE_WORDS = /\b(progress|review|testing|test|qa|candidate|develop(ment)?|doing|started|verify|blocked)\b/i;

/** The desktop's status category of a row (inboxItemStatus): trackers are only open or closed. */
export function statusCategory(item: Pick<RemoteInboxItem, "kind" | "state" | "draft">): InboxStatusCategory {
  const state = item.state.trim();
  if (item.kind === "jira" || item.kind === "linear") return CLOSED_WORDS.test(state) ? "closed" : "open";
  if (item.draft) return "draft";
  if (/^merged$/i.test(state)) return "merged";
  if (/^closed$/i.test(state)) return "closed";
  return "open";
}

/** Pull requests and merge requests; every other kind (issue, Jira, Linear) is an issue. */
export const isPullRequest = (item: Pick<RemoteInboxItem, "kind">) => item.kind === "pr";

/**
 * Colour of a row's status badge: open work is green, work in progress blue, merged purple, a
 * requested change red; finished work stays neutral. Tracker workflows are read from their names.
 */
export function statusTone(item: Pick<RemoteInboxItem, "kind" | "state" | "draft">): "default" | "success" | "info" | "danger" | "warning" | "active" {
  const state = item.state.trim().toUpperCase();
  if (state === "CHANGES_REQUESTED") return "danger";
  if (state === "REVIEW_REQUIRED") return "warning";
  if (state === "APPROVED") return "success";
  const category = statusCategory(item);
  if (category === "merged") return "active";
  if (category === "closed" || category === "draft") return "default";
  if ((item.kind === "jira" || item.kind === "linear") && ACTIVE_WORDS.test(item.state)) return "info";
  return "success";
}

const DAY = 24 * 60 * 60_000;
function since(time: InboxTimeFilter, now: number) {
  if (time === "today") { const start = new Date(now); start.setHours(0, 0, 0, 0); return start.getTime(); }
  return time === "7d" ? now - 7 * DAY : time === "30d" ? now - 30 * DAY : -Infinity;
}

/** Rows matching everything but the provider choice, so the provider chips can count them. */
export function narrowInbox(items: readonly RemoteInboxItem[], view: InboxView, now = Date.now()) {
  const start = since(view.time, now);
  return items.filter((item) => {
    const category = statusCategory(item);
    // Trackers have only Open and Closed; a Draft or Merged choice alone does not hide them.
    const trackerStatuses = view.statuses.filter((status) => status === "open" || status === "closed");
    const statuses = isTracker(item) ? trackerStatuses : view.statuses;
    if (statuses.length && !statuses.includes(category)) return false;
    // Tracker issues are issues: Pull requests leaves them out, Issues keeps them.
    if (view.type !== "all" && (view.type === "pr") !== isPullRequest(item)) return false;
    if (!isTracker(item) && view.repos.length && !view.repos.includes(item.repo)) return false;
    if (isTracker(item) && view.teams.length && !view.teams.includes(item.teamId ?? "")) return false;
    if (item.provider === "linear" && view.trackerProjects.length &&
      !view.trackerProjects.includes(item.projectId?.trim() || LINEAR_NO_PROJECT)) return false;
    if (item.provider === "jira") {
      if (view.workflow.length && !view.workflow.includes(item.state)) return false;
      if (view.assignees.length || view.unassigned) {
        const match = (view.unassigned && item.assignees.length === 0) ||
          item.assignees.some((person) => view.assignees.includes(jiraAssigneeKey(person)));
        if (!match) return false;
      }
    }
    return start === -Infinity || Date.parse(item.updatedAt) >= start;
  });
}

/** The rows the list shows, in the chosen order: most recently updated first, or by title. */
export function applyInboxView(items: readonly RemoteInboxItem[], view: InboxView, now = Date.now()) {
  const time = (item: RemoteInboxItem) => Date.parse(item.updatedAt) || 0;
  return narrowInbox(items, view, now)
    .filter((item) => view.provider === "all" || item.provider === view.provider)
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (view.sort === "title" ? a.item.title.localeCompare(b.item.title) : time(b.item) - time(a.item)) || a.index - b.index)
    .map(({ item }) => item);
}

/** How many rows each provider has, in the desktop's provider order; providers with none are left out. */
export function providerCounts(items: readonly RemoteInboxItem[]) {
  const counts = new Map<RemoteInboxProvider, number>();
  for (const item of items) counts.set(item.provider, (counts.get(item.provider) ?? 0) + 1);
  return PROVIDER_ORDER.filter((provider) => counts.has(provider)).map((provider) => ({ provider, count: counts.get(provider)! }));
}

type Option = { value: string; label: string };
const byLabel = (a: Option, b: Option) => a.label.localeCompare(b.label);

/**
 * The choices each filter offers, read from the returned rows like the desktop does (Linear
 * projects, Jira assignees and statuses are not fetched separately). A chosen value stays offered
 * even when this read returned none of its rows.
 */
export function inboxFilterOptions(items: readonly RemoteInboxItem[], view: InboxView, noProject: string) {
  const repos = new Map<string, string>(), teams = new Map<string, string>(), projects = new Map<string, string>();
  const assignees = new Map<string, string>(), workflow = new Map<string, string>();
  for (const item of items) {
    if (!isTracker(item)) { if (item.repo) repos.set(item.repo, item.repo); continue; }
    if (item.teamId) teams.set(item.teamId, item.teamName?.trim() || item.teamId);
    if (item.provider === "linear") {
      const id = item.projectId?.trim();
      projects.set(id || LINEAR_NO_PROJECT, id ? item.projectName?.trim() || id : noProject);
    }
    if (item.provider === "jira") {
      workflow.set(item.state, item.state);
      for (const person of item.assignees) assignees.set(jiraAssigneeKey(person), person.login);
    }
  }
  const options = (found: Map<string, string>, chosen: readonly string[]) => {
    for (const value of chosen) if (!found.has(value)) found.set(value, value === LINEAR_NO_PROJECT ? noProject : value);
    return [...found].map(([value, label]) => ({ value, label })).sort(byLabel);
  };
  return {
    repos: options(repos, view.repos), teams: options(teams, view.teams), trackerProjects: options(projects, view.trackerProjects),
    assignees: options(assignees, view.assignees), workflow: options(workflow, view.workflow),
  };
}

/** How many filter dimensions are narrowed (each counts once, like the desktop's filter badge). */
export function viewFilterCount(view: InboxView) {
  return Number(view.type !== "all") + Number(view.statuses.length > 0) + Number(view.time !== "all") +
    Number(view.repos.length > 0) + Number(view.teams.length > 0) + Number(view.trackerProjects.length > 0) +
    Number(view.assignees.length > 0 || view.unassigned) + Number(view.workflow.length > 0);
}

/** Providers the Pull requests list reads: the code hosts, never the trackers (like the desktop). */
export const PULL_REQUEST_PROVIDERS: readonly RemoteInboxProvider[] = ["github", "gitlab", "azuredevops"];

/** Filter dimensions in use, Assigned to me, the provider and a non-default sort included: the trigger's dot and spoken count. */
export function inboxActiveFilters(view: InboxView, assigned: boolean) {
  return viewFilterCount(view) + Number(assigned) + Number(view.provider !== "all") + Number(view.sort !== "updated");
}
