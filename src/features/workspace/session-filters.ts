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

export const SESSION_TIME_FILTERS: readonly SessionTimeFilter[] = ["recent", "all", "today", "7d", "30d"];

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
