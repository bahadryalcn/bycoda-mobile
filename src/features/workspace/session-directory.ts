import type { HostProjectDirectory, HostSessionSummary } from "@/domain/types";
import { isRunningSession } from "./activity-model";
import { sessionActivityAt } from "./session-collection";

export type SessionLayout = NonNullable<HostProjectDirectory["projects"][number]["sessionLayout"]>;
export type SessionDirectoryRow =
  | { kind: "folder"; key: string; folder: SessionLayout["folders"][number]; depth: number; count: number; expanded: boolean; ancestors?: readonly string[] }
  | { kind: "session"; key: string; session: HostSessionSummary; depth: number; ancestors?: readonly string[] };

/** Searching an organization label includes its descendants without rewriting membership. */
export function filterSessionDirectory(
  sessions: readonly HostSessionSummary[],
  layout: SessionLayout | undefined,
  search: string,
  projectLabel = "",
): HostSessionSummary[] {
  const query = search.trim().toLocaleLowerCase();
  if (!query || projectLabel.toLocaleLowerCase().includes(query)) return [...sessions];
  const matching = new Set<string>();
  const folders = new Map(layout?.folders.map((folder) => [folder.id, folder]));
  const children = new Map<string, SessionLayout["folders"]>();
  for (const folder of folders.values()) {
    if (folder.parentId) children.set(folder.parentId, [...(children.get(folder.parentId) ?? []), folder]);
  }
  const visited = new Set<string>();
  const include = (folder: SessionLayout["folders"][number]) => {
    if (visited.has(folder.id)) return;
    visited.add(folder.id);
    for (const id of folder.sessionIds) matching.add(id);
    for (const child of children.get(folder.id) ?? []) include(child);
  };
  for (const folder of folders.values()) {
    const path: string[] = [];
    const ancestors = new Set<string>();
    let current: typeof folder | undefined = folder;
    while (current && !ancestors.has(current.id)) {
      ancestors.add(current.id);
      path.unshift(current.name);
      current = current.parentId ? folders.get(current.parentId) : undefined;
    }
    if (path.join(" / ").toLocaleLowerCase().includes(query)) include(folder);
  }
  return sessions.filter((session) => matching.has(session.id) ||
    `${session.title} ${session.harness} ${session.branch ?? ""} ${session.model ?? ""}`
      .toLocaleLowerCase().includes(query));
}

export function toggleSessionDirectoryFolder(
  collapsed: Readonly<Record<string, boolean>>,
  row: Extract<SessionDirectoryRow, { kind: "folder" }>,
  searching: boolean,
): Readonly<Record<string, boolean>> {
  // Search temporarily expands every retained ancestor; taps must not edit the
  // saved view that becomes visible again when the search is cleared.
  if (searching) return collapsed;
  return { ...collapsed, [row.folder.id]: row.expanded };
}

function status(a: HostSessionSummary, b: HostSessionSummary) {
  return Number(isRunningSession(b)) - Number(isRunningSession(a)) || Number(!!b.needsInput) - Number(!!a.needsInput);
}
function recency(a: HostSessionSummary, b: HostSessionSummary) {
  return Number(!!b.pinned) - Number(!!a.pinned) || sessionActivityAt(b) - sessionActivityAt(a) || a.id.localeCompare(b.id);
}
function ordered(items: HostSessionSummary[], ids?: readonly string[]) {
  const rank = new Map(ids?.map((id, index) => [id, index]));
  return [...items].sort(recency).sort((a, b) =>
    (rank.has(a.id) ? 1 : 0) - (rank.has(b.id) ? 1 : 0) ||
    (rank.has(a.id) && rank.has(b.id) ? rank.get(a.id)! - rank.get(b.id)! : 0)).sort(status);
}

/** Flatten organization before rendering so every session remains a virtualization unit. */
export function sessionDirectoryRows(
  sessions: readonly HostSessionSummary[], layout?: SessionLayout,
  collapsed: Readonly<Record<string, boolean>> = {}, searching = false,
): SessionDirectoryRow[] {
  // Like desktop, running sessions stay in their folders; status only orders siblings.
  if (!layout) return [...sessions].sort(recency).sort(status).map((session) => ({ kind: "session", key: `session:${session.id}`, session, depth: 0 }));
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const folders = new Map(layout.folders.map((folder) => [folder.id, folder]));
  const childrenByParent = new Map<string, SessionLayout["folders"]>();
  for (const folder of layout.folders) {
    if (folder.parentId) childrenByParent.set(folder.parentId, [...(childrenByParent.get(folder.parentId) ?? []), folder]);
  }
  const assigned = new Set<string>();
  const visited = new Set<string>();
  const visit = (folder: SessionLayout["folders"][number], depth: number, ancestors: readonly string[] = []): { rows: SessionDirectoryRow[]; count: number } => {
    if (visited.has(folder.id) || depth >= 4) return { rows: [], count: 0 };
    visited.add(folder.id);
    const children = (childrenByParent.get(folder.id) ?? []).map((child) => visit(child, depth + 1, [...ancestors, folder.name]));
    const members = folder.sessionIds.flatMap((id) => {
      const session = byId.get(id);
      if (!session || assigned.has(id)) return [];
      assigned.add(id);
      return [session];
    });
    const count = members.length + children.reduce((sum, child) => sum + child.count, 0);
    if (!count) return { rows: [], count: 0 };
    const expanded = searching || !(collapsed[folder.id] ?? folder.collapsed);
    return { count, rows: [
      { kind: "folder", key: `folder:${folder.id}`, folder, depth, count, expanded, ancestors },
      ...(expanded ? [ ...children.flatMap((child) => child.rows), ...ordered(members, folder.ordered ? folder.sessionIds : undefined)
        .map((session): SessionDirectoryRow => ({ kind: "session", key: `session:${session.id}`, session, depth: Math.min(depth + 1, 4), ancestors: [...ancestors, folder.name] })) ] : []),
    ] };
  };
  const roots = layout.folders.filter((folder) => !folder.parentId || !folders.has(folder.parentId));
  const normal = roots.filter((folder) => !folder.pinned).flatMap((folder) => visit(folder, 0).rows);
  const pinned = roots.filter((folder) => folder.pinned).flatMap((folder) => visit(folder, 0).rows);
  // A damaged parent cycle must not make otherwise reachable sessions disappear.
  const recovered = layout.folders.filter((folder) => !visited.has(folder.id)).flatMap((folder) => visit(folder, 0).rows);
  const loose = [...byId.values()].filter((session) => !assigned.has(session.id));
  const sessionRows = (items: HostSessionSummary[], ids?: string[]): SessionDirectoryRow[] => ordered(items, ids)
    .map((session) => ({ kind: "session", key: `session:${session.id}`, session, depth: 0 }));
  return [...normal, ...pinned, ...recovered, ...sessionRows(loose.filter((session) => session.pinned), layout.order.pinned),
    ...sessionRows(loose.filter((session) => !session.pinned), layout.order.loose)];
}
