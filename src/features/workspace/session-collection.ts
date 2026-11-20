import { sessionIsSnoozed } from "./session-attention-model";
import type { HostProjectDirectory } from "@/domain/types";
import type { ActiveSession } from "./activity-model";
import { isRunningSession } from "./activity-model";
import { filterSessionDirectory } from "./session-directory";

type DirectoryProject = HostProjectDirectory["projects"][number];

/**
 * Desktop parity: internal orchestration workers never appear in a session list; they show
 * in their lead's panel. Older Hosts omit the marker, so their workers stay listed.
 */
export const listedSession = (session: Pick<ActiveSession["session"], "orchestrationLeadId">) =>
  !session.orchestrationLeadId;

/** A project's own list also leaves conversations a crew run owns to Crews, as the desktop does. */
export const listedProjectSession = (
  session: Pick<ActiveSession["session"], "orchestrationLeadId" | "crewRunId">,
) => listedSession(session) && !session.crewRunId;

export type SessionShelfId = "pinned" | "needs" | "running" | "recent" | "settled" | "snoozed" | "archived";
export type SessionShelfRow =
  | { kind: "header"; key: string; shelf: SessionShelfId; count: number; expanded: boolean }
  | { kind: "session"; key: string; project: ActiveSession["project"]; session: ActiveSession["session"] };

export const shelfOf = (
  session: ActiveSession["session"],
  archived: boolean,
  settled: ReadonlySet<string>,
  now = Date.now(),
): SessionShelfId =>
  archived || session.archived ? "archived"
    : sessionIsSnoozed(session, now) ? "snoozed"
    : settled.has(session.id) && !isRunningSession(session) && !session.needsInput ? "settled"
    : session.pinned ? "pinned"
    : session.needsInput ? "needs"
    : isRunningSession(session) ? "running"
    : "recent";
const shelfOrder: readonly SessionShelfId[] = ["pinned", "needs", "running", "recent", "settled", "snoozed", "archived"];

/** Status shelves keep the directory's ordering; an empty shelf has no header. */
export function sessionShelfRows(
  directory: readonly ActiveSession[],
  collapsed: Readonly<Partial<Record<SessionShelfId, boolean>>> = {},
  searching = false,
  archived = false,
  settledIds: ReadonlySet<string> = new Set(),
): SessionShelfRow[] {
  const shelves = new Map<SessionShelfId, ActiveSession[]>();
  for (const entry of directory) {
    const id = shelfOf(entry.session, archived, settledIds);
    shelves.set(id, [...(shelves.get(id) ?? []), entry]);
  }
  return shelfOrder.flatMap((shelf): SessionShelfRow[] => {
    const members = shelves.get(shelf);
    if (!members?.length) return [];
    // Settled sessions stay folded until the owner opens the group.
    const expanded = searching || !(collapsed[shelf] ?? (shelf === "settled" || shelf === "snoozed"));
    return [
      { kind: "header", key: `shelf:${shelf}`, shelf, count: members.length, expanded },
      ...(expanded ? members.map(({ project, session }): SessionShelfRow =>
        ({ kind: "session", key: `${project.id}:${session.id}`, project, session })) : []),
    ];
  });
}

/** Match project/folder names while retaining the activity directory's ordering and host IDs. */
export function filterProjectSessionDirectory(
  projects: readonly DirectoryProject[],
  directory: readonly ActiveSession[],
  search: string,
): { project: DirectoryProject; session: ActiveSession["session"] }[] {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const members = new Map<string, ActiveSession["session"][]>();
  for (const { project, session } of directory) {
    const sessions = members.get(project.id) ?? [];
    sessions.push(session);
    members.set(project.id, sessions);
  }
  const matches = new Map(projects.map((project) => [project.id, new Set(
    filterSessionDirectory(members.get(project.id) ?? [], project.sessionLayout, search, `${project.name} ${project.cwd}`)
      .map((session) => session.id),
  )]));
  return directory.flatMap(({ project, session }) => {
    const current = byId.get(project.id);
    return current && matches.get(project.id)?.has(session.id) ? [{ project: current, session }] : [];
  });
}

