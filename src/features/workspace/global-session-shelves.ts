import type { HostProjectDirectory } from "@/domain/types";
import type { ActiveSession } from "./activity-model";
import { shelfOf, type SessionShelfId, type SessionShelfRow } from "./session-collection";
import { sessionActivityAt } from "./session-directory";
import { sessionDirectoryRows, type SessionDirectoryRow } from "./session-directory";
import { orderSessionRuns, type SessionOrderSignals } from "./session-row-state";

type ShelfEntry = { project: HostProjectDirectory["projects"][number]; session: ActiveSession["session"] };
type Header = Extract<SessionShelfRow, { kind: "header" }>;
export type GlobalSessionRow =
  | Header
  | (Extract<SessionDirectoryRow, { kind: "folder" }> & { project: ShelfEntry["project"] })
  | (Extract<SessionDirectoryRow, { kind: "session" }> & { project: ShelfEntry["project"] });

/** Folder collapse state is kept per project because folder ids are only unique inside one project. */
export type FolderCollapse = Readonly<Record<string, Readonly<Record<string, boolean>>>>;

const shelfOrder: readonly SessionShelfId[] = ["pinned", "needs", "running", "recent", "settled", "snoozed", "archived"];
/** Status shelves are flat; the owner's folders organize what is left in Recent and Archived. */
const organized: ReadonlySet<SessionShelfId> = new Set(["recent", "archived"]);

/**
 * Cross-project shelves with the project screen's folder layout inside Recent and Archived.
 * Folder blocks come first (grouped per project); each shelf, folder and loose list leads with
 * the desktop status rank, ties keeping the directory order.
 */
export function globalSessionRows(
  directory: readonly ShelfEntry[],
  folderCollapse: FolderCollapse = {},
  shelfCollapse: Readonly<Partial<Record<SessionShelfId, boolean>>> = {},
  searching = false,
  archived = false,
  settledIds: ReadonlySet<string> = new Set(),
  signals: SessionOrderSignals = { now: Date.now() },
): GlobalSessionRow[] {
  const shelves = new Map<SessionShelfId, ShelfEntry[]>();
  for (const entry of directory) {
    const id = shelfOf(entry.session, archived, settledIds, signals.now);
    shelves.set(id, [...(shelves.get(id) ?? []), entry]);
  }
  return shelfOrder.flatMap((shelf): GlobalSessionRow[] => {
    const members = shelves.get(shelf);
    if (!members?.length) return [];
    const expanded = searching || !(shelfCollapse[shelf] ?? (shelf === "settled" || shelf === "snoozed"));
    const header: Header = { kind: "header", key: `shelf:${shelf}`, shelf, count: members.length, expanded };
    if (!expanded) return [header];
    const rows = organized.has(shelf) ? organize(members, folderCollapse, searching) : flat(members);
    return [header, ...orderSessionRuns(rows, signals)];
  });
}

const flat = (members: readonly ShelfEntry[]): GlobalSessionRow[] =>
  members.map(({ project, session }) => ({
    kind: "session", key: `${project.id}:${session.id}`, project, session, depth: 0,
  }));

/** Desktop Last sessions keeps a seven-day activity window. */
export const GLOBAL_RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The seven-day window only trims quiet history: pinned, running and input-waiting sessions
 * always stay reachable, however old their last turn is.
 */
const inRecentWindow = (now?: number) => {
  const cutoff = now === undefined ? -Infinity : now - GLOBAL_RECENT_WINDOW_MS;
  return ({ session }: ShelfEntry) =>
    session.pinned || session.needsInput || session.status === "running" || sessionActivityAt(session) >= cutoff;
};

/**
 * Global Sessions follows desktop Last sessions: newest turn activity first, across projects.
 * Pinning never reorders this list (desktop parity); rows carry a pin mark and actions confirm with a toast.
 * Pass `now` to keep only the desktop window; archive and search views omit it to reach older sessions.
 */
export function recentGlobalSessionRows(directory: readonly ShelfEntry[], now?: number): GlobalSessionRow[] {
  return flat(
    directory
      .filter(inRecentWindow(now))
      .sort((a, b) => sessionActivityAt(b.session) - sessionActivityAt(a.session)),
  );
}

/** Attention first, then running sessions, with newest activity first in each group. */
export function urgencyGlobalSessionRows(directory: readonly ShelfEntry[], now?: number): GlobalSessionRow[] {
  const urgency = (session: ShelfEntry["session"]) =>
    session.needsInput || session.issue === "failed" ? 0 : session.status === "running" ? 1 : 2;
  return flat(directory.filter(inRecentWindow(now))
    .sort((a, b) => urgency(a.session) - urgency(b.session) || sessionActivityAt(b.session) - sessionActivityAt(a.session)));
}

function organize(members: readonly ShelfEntry[], folderCollapse: FolderCollapse, searching: boolean): GlobalSessionRow[] {
  const byProject = new Map<string, ShelfEntry[]>();
  for (const entry of members) byProject.set(entry.project.id, [...(byProject.get(entry.project.id) ?? []), entry]);
  const looseIds = new Set<string>();
  const folderRows: GlobalSessionRow[] = [];
  for (const entries of byProject.values()) {
    const project = entries[0]!.project;
    const rows = sessionDirectoryRows(entries.map((e) => e.session), project.sessionLayout, folderCollapse[project.id], searching);
    for (const row of rows) {
      if (row.kind === "session" && row.depth === 0) { looseIds.add(row.session.id); continue; }
      folderRows.push({ ...row, key: `${project.id}:${row.key}`, project } as GlobalSessionRow);
    }
  }
  return [...folderRows, ...flat(members.filter(({ session }) => looseIds.has(session.id)))];
}

/** A project section in the grouped Sessions view; `key` doubles as its persisted collapse key. */
export type ProjectGroupHeader = {
  kind: "project";
  key: `project:${string}`;
  project: ShelfEntry["project"];
  count: number;
  /** Members whose run is in flight; the header marks the group live even while it is folded. */
  running: number;
  expanded: boolean;
};
export type SessionSectionRow = GlobalSessionRow | ProjectGroupHeader;

export type SessionSectionOptions = {
  /** Persisted explicit choices keyed `shelf:<id>` or `project:<id>`; missing keys use the default. */
  collapsed?: Readonly<Record<string, boolean>>;
  /** Search opens every section so a match is never hidden in a folded one. */
  searching?: boolean;
  /** The archive view: every row is in Archived. */
  archived?: boolean;
  /** The snooze view: every row is in Snoozed, so that shelf opens like Archived does. */
  snoozed?: boolean;
  /** The session shown beside the list (tablet): its section opens without storing a choice. */
  reveal?: string;
  settledIds?: ReadonlySet<string>;
  /** Clock for snooze and the recent window. */
  now?: number;
  /** Trim quiet history to the seven-day window (pinned, running and waiting stay). */
  windowed?: boolean;
  /** Tablet urgency column: failures lead their section like sessions that need a reply. */
  urgency?: boolean;
};

/** Settled and snoozed history stays folded until the owner opens it. */
const foldedByDefault: ReadonlySet<SessionShelfId> = new Set(["settled", "snoozed"]);
export const shelfCollapseKey = (shelf: SessionShelfId) => `shelf:${shelf}` as const;
export const projectCollapseKey = (projectId: string) => `project:${projectId}` as const;

const byActivity = (a: ShelfEntry, b: ShelfEntry) => sessionActivityAt(b.session) - sessionActivityAt(a.session);
const urgencyRank = (session: ShelfEntry["session"], settled: ReadonlySet<string>) =>
  session.needsInput || session.issue === "failed" ? 0
    : session.status === "running" ? 1
    : settled.has(session.id) ? 3 : 2;

function shelvesOf(directory: readonly ShelfEntry[], options: SessionSectionOptions) {
  const { archived = false, settledIds = new Set<string>(), now = Date.now(), windowed = false } = options;
  const shelves = new Map<SessionShelfId, ShelfEntry[]>();
  for (const entry of directory.filter(inRecentWindow(windowed ? now : undefined))) {
    const id = shelfOf(entry.session, archived, settledIds, now);
    shelves.set(id, [...(shelves.get(id) ?? []), entry]);
  }
  return shelves;
}

/**
 * A default fold only hides history behind the active shelves. The snooze view and a shelf that is
 * the page's only section open by default; an explicit stored choice still wins.
 */
const defaultFolded = (shelf: SessionShelfId, options: SessionSectionOptions, only: boolean) =>
  foldedByDefault.has(shelf) && !only && !(options.snoozed && shelf === "snoozed");
const reveals = (members: readonly ShelfEntry[], reveal?: string) =>
  reveal !== undefined && members.some(({ session }) => session.id === reveal);

function shelfSection(shelf: SessionShelfId, members: readonly ShelfEntry[] | undefined, options: SessionSectionOptions, only = false): SessionSectionRow[] {
  if (!members?.length) return [];
  const { collapsed = {}, searching = false, urgency = false, settledIds = new Set<string>() } = options;
  const key = shelfCollapseKey(shelf);
  const expanded = searching || reveals(members, options.reveal) || !(collapsed[key] ?? defaultFolded(shelf, options, only));
  const header: Header = { kind: "header", key, shelf, count: members.length, expanded };
  if (!expanded) return [header];
  const order = urgency
    ? (a: ShelfEntry, b: ShelfEntry) => urgencyRank(a.session, settledIds) - urgencyRank(b.session, settledIds) || byActivity(a, b)
    : byActivity;
  return [header, ...flat([...members].sort(order))];
}

/**
 * The Sessions tab, all projects together: Pinned, Needs you, Working, Recent and Settled
 * (folded by default), each newest first. Archive and snooze views fill their own section.
 */
export function sessionSectionRows(directory: readonly ShelfEntry[], options: SessionSectionOptions = {}): SessionSectionRow[] {
  const shelves = shelvesOf(directory, options);
  const only = [...shelves.values()].filter((members) => members.length).length === 1;
  return shelfOrder.flatMap((shelf) => shelfSection(shelf, shelves.get(shelf), options, only));
}

/**
 * The Sessions tab grouped by project: Pinned stays on top across projects, then one folding
 * section per project ordered by its latest activity. Inside a project the rows lead with what
 * needs the owner (reply or failure), then running work, then the rest; settled sessions last.
 */
export function projectGroupedSessionRows(directory: readonly ShelfEntry[], options: SessionSectionOptions = {}): SessionSectionRow[] {
  const shelves = shelvesOf(directory, options);
  const { collapsed = {}, searching = false, settledIds = new Set<string>() } = options;
  const byProject = new Map<string, ShelfEntry[]>();
  for (const shelf of shelfOrder) {
    if (shelf === "pinned") continue;
    for (const entry of shelves.get(shelf) ?? []) byProject.set(entry.project.id, [...(byProject.get(entry.project.id) ?? []), entry]);
  }
  const latest = (entries: readonly ShelfEntry[]) => Math.max(...entries.map(({ session }) => sessionActivityAt(session)));
  const projects = [...byProject.values()].sort((a, b) => latest(b) - latest(a));
  return [
    ...shelfSection("pinned", shelves.get("pinned"), { ...options, urgency: false }),
    ...projects.flatMap((members): SessionSectionRow[] => {
      const project = members[0]!.project;
      const key = projectCollapseKey(project.id);
      const expanded = searching || reveals(members, options.reveal) || !collapsed[key];
      const running = members.filter(({ session }) => session.status === "running").length;
      const header: ProjectGroupHeader = { kind: "project", key, project, count: members.length, running, expanded };
      if (!expanded) return [header];
      const rows = [...members].sort((a, b) =>
        urgencyRank(a.session, settledIds) - urgencyRank(b.session, settledIds) || byActivity(a, b));
      return [header, ...flat(rows)];
    }),
  ];
}

/** The section header key (`shelf:` or `project:`) whose rows hold `sessionId`, if it is listed. */
export function sectionKeyOf(rows: readonly SessionSectionRow[], sessionId: string | undefined): string | undefined {
  if (sessionId === undefined) return undefined;
  let section: string | undefined;
  for (const row of rows) {
    if (row.kind === "header" || row.kind === "project") section = row.key;
    else if (row.kind === "session" && row.session.id === sessionId) return section;
  }
  return undefined;
}
