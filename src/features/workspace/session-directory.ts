import type { HostProjectDirectory, HostSessionSummary } from "@/domain/types";

export type SessionLayout = NonNullable<HostProjectDirectory["projects"][number]["sessionLayout"]>;
export type SessionDirectoryRow =
  | { kind: "folder"; key: string; folder: SessionLayout["folders"][number]; depth: number; count: number; expanded: boolean }
  | { kind: "session"; key: string; session: HostSessionSummary; depth: number };

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
  return Number(!!b.needsInput) - Number(!!a.needsInput) || Number(b.status === "running") - Number(a.status === "running");
}
function recency(a: HostSessionSummary, b: HostSessionSummary) {
  return Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id);
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
  if (!layout) return [...sessions].sort(recency).sort(status).map((session) => ({ kind: "session", key: `session:${session.id}`, session, depth: 0 }));
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const folders = new Map(layout.folders.map((folder) => [folder.id, folder]));
  const childrenByParent = new Map<string, SessionLayout["folders"]>();
  for (const folder of layout.folders) {
    if (folder.parentId) childrenByParent.set(folder.parentId, [...(childrenByParent.get(folder.parentId) ?? []), folder]);
  }
  const assigned = new Set<string>();
  const visited = new Set<string>();
  const visit = (folder: SessionLayout["folders"][number], depth: number): { rows: SessionDirectoryRow[]; count: number } => {
    if (visited.has(folder.id) || depth >= 4) return { rows: [], count: 0 };
    visited.add(folder.id);
    const children = (childrenByParent.get(folder.id) ?? []).map((child) => visit(child, depth + 1));
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
      { kind: "folder", key: `folder:${folder.id}`, folder, depth, count, expanded },
      ...(expanded ? [ ...children.flatMap((child) => child.rows), ...ordered(members, folder.ordered ? folder.sessionIds : undefined)
        .map((session): SessionDirectoryRow => ({ kind: "session", key: `session:${session.id}`, session, depth: Math.min(depth + 1, 4) })) ] : []),
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
