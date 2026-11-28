import type { SessionTimeFilter as DesktopSessionTimeFilter } from "../../../../src/features/sessions/model/sessionFilters";
import type { HostSessionSummary } from "@/domain/types";

export type SessionTimeFilter = DesktopSessionTimeFilter | "recent";

/** Desktop sidebar filters (Provider, Managed, Time) with the same semantics; status stays mobile's own. */
export type SessionListFilters = {
  /** Providers the person turned off; new providers stay visible. */
  hiddenProviders: string[];
  /** Only sessions the Host stamped as assistant-managed. */
  managed: boolean;
  time: SessionTimeFilter;
};

export const defaultSessionListFilters: SessionListFilters = { hiddenProviders: [], managed: false, time: "recent" };

/** Time choices offered in the filter sheet. The default "recent" window already covers seven days, so "7d" is not repeated. */
export const SESSION_TIME_FILTERS: readonly SessionTimeFilter[] = ["today", "recent", "30d", "all"];

const dayMs = 24 * 60 * 60 * 1000;

/** Mirrors desktop `timeFilterStart`: local midnight for Today, rolling windows otherwise. */
export function sessionTimeStart(time: SessionTimeFilter, now: number): number {
  if (time === "today") {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }
  if (time === "7d") return now - 7 * dayMs;
  if (time === "30d") return now - 30 * dayMs;
  return 0;
}

/** Providers present in the rows, in first-seen order. */
export function sessionProviders(sessions: readonly Pick<HostSessionSummary, "harness">[]): string[] {
  return [...new Set(sessions.map((session) => session.harness))];
}

export function activeSessionFilterCount(filters: SessionListFilters): number {
  return Number(filters.hiddenProviders.length > 0) + Number(filters.managed) + Number(filters.time !== "recent");
}

type FilterableSession = Pick<HostSessionSummary, "harness" | "managedBy" | "lastActivityAt" | "updatedAt">;

/** Management is read from the Host stamp, never inferred from titles or authors. */
export function matchesSessionListFilters(session: FilterableSession, filters: SessionListFilters, now: number): boolean {
  if (filters.hiddenProviders.includes(session.harness)) return false;
  if (filters.managed && session.managedBy?.assistant !== true) return false;
  if (filters.time !== "recent" && filters.time !== "all" &&
      (session.lastActivityAt ?? session.updatedAt) < sessionTimeStart(filters.time, now)) return false;
  return true;
}

/** The quick status chips in the list header (also offered in the filter sheet). */
export type SessionStatusFilter = "all" | "running" | "reply";

export function matchesSessionStatus(session: Pick<HostSessionSummary, "status" | "needsInput">, status: SessionStatusFilter): boolean {
  return status === "all" || (status === "reply" ? !!session.needsInput : session.status === "running");
}

/**
 * The Sessions project filter applies only while the project is on this computer's list; a
 * project that disappeared shows All projects instead of an empty page. Before the directory is
 * proven the saved project is kept, so a slow load does not flash every project.
 */
export function effectiveSessionProject(projectId: string | null, projects: readonly { id: string }[], directoryReady: boolean): string | null {
  if (!projectId) return null;
  return !directoryReady || projects.some((project) => project.id === projectId) ? projectId : null;
}

/** The header row's reset mark appears once a project or status chip narrows the list. */
export function sessionQuickFiltersActive(projectId: string | null, status: SessionStatusFilter, archived: boolean): boolean {
  return !!projectId || (!archived && status !== "all");
}
