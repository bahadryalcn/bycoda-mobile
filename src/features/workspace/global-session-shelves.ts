import type { HostProjectDirectory } from "@/domain/types";
import type { ActiveSession } from "./activity-model";
import { shelfOf, type SessionShelfId, type SessionShelfRow } from "./session-collection";
import { sessionDirectoryRows, type SessionDirectoryRow } from "./session-directory";

type ShelfEntry = { project: HostProjectDirectory["projects"][number]; session: ActiveSession["session"] };
type Header = Extract<SessionShelfRow, { kind: "header" }>;
export type GlobalSessionRow =
  | Header
  | (Extract<SessionDirectoryRow, { kind: "folder" }> & { project: ShelfEntry["project"] })
  | (Extract<SessionDirectoryRow, { kind: "session" }> & { project: ShelfEntry["project"] });

/** Folder collapse state is kept per project because folder ids are only unique inside one project. */
export type FolderCollapse = Readonly<Record<string, Readonly<Record<string, boolean>>>>;

const shelfOrder: readonly SessionShelfId[] = ["pinned", "needs", "running", "recent", "settled", "archived"];
/** Status shelves are flat; the owner's folders organize what is left in Recent and Archived. */
const organized: ReadonlySet<SessionShelfId> = new Set(["recent", "archived"]);

/**
 * Cross-project shelves with the project screen's folder layout inside Recent and Archived.
 * Folder blocks come first (grouped per project), loose sessions keep the directory order.
 */
export function globalSessionRows(
  directory: readonly ShelfEntry[],
  folderCollapse: FolderCollapse = {},
  shelfCollapse: Readonly<Partial<Record<SessionShelfId, boolean>>> = {},
  searching = false,
  archived = false,
  settledIds: ReadonlySet<string> = new Set(),
): GlobalSessionRow[] {
  const shelves = new Map<SessionShelfId, ShelfEntry[]>();
  for (const entry of directory) {
    const id = shelfOf(entry.session, archived, settledIds);
    shelves.set(id, [...(shelves.get(id) ?? []), entry]);
  }
  return shelfOrder.flatMap((shelf): GlobalSessionRow[] => {
    const members = shelves.get(shelf);
    if (!members?.length) return [];
    const expanded = searching || !(shelfCollapse[shelf] ?? shelf === "settled");
    const header: Header = { kind: "header", key: `shelf:${shelf}`, shelf, count: members.length, expanded };
    if (!expanded) return [header];
    return [header, ...(organized.has(shelf) ? organize(members, folderCollapse, searching) : flat(members))];
  });
}

const flat = (members: readonly ShelfEntry[]): GlobalSessionRow[] =>
  members.map(({ project, session }) => ({
    kind: "session", key: `${project.id}:${session.id}`, project, session, depth: 0,
  }));

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
