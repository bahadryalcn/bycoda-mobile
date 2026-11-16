import { sessionIsSnoozed } from "./session-attention-model";
import type { HostSessionSummary } from "@/domain/types";
import { isRunningSession } from "./activity-model";
import type { SessionShelfId, SessionShelfRow } from "./session-collection";
import { sessionDirectoryRows, type SessionDirectoryRow, type SessionLayout } from "./session-directory";
import { orderSessionRuns, type SessionOrderSignals } from "./session-row-state";

export type ProjectSessionRow = SessionDirectoryRow | Extract<SessionShelfRow, { kind: "header" }>;

/**
 * Project Sessions tab in desktop group order: folders, the Pinned group (pinned folders, then
 * pinned loose sessions), loose sessions, then a collapsed Settled group of loose sessions.
 * Like desktop, folder members stay in their folder whether pinned or settled; each group
 * leads with the desktop status rank. Running work still rises above folders (mobile rule).
 */
export function projectSessionRows(
  sessions: readonly HostSessionSummary[],
  layout: SessionLayout | undefined,
  collapsed: Readonly<Record<string, boolean>>,
  shelfCollapsed: Readonly<Partial<Record<SessionShelfId, boolean>>>,
  searching: boolean,
  settledIds: ReadonlySet<string>,
  archived: boolean,
  signals: SessionOrderSignals = { now: Date.now() },
): ProjectSessionRow[] {
  if (archived) return orderSessionRuns(sessionDirectoryRows(sessions, layout, collapsed, searching), signals);
  const folders = layout?.folders ?? [];
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const inPinnedTree = (folder: (typeof folders)[number]) => {
    const seen = new Set<string>();
    for (let current: typeof folder | undefined = folder; current && !seen.has(current.id); ) {
      if (!current.parentId || !byId.has(current.parentId)) return !!current.pinned;
      seen.add(current.id);
      current = byId.get(current.parentId);
    }
    return false;
  };
  const pinnedFolders = folders.filter(inPinnedTree);
  const pinnedFolderIds = new Set(pinnedFolders.map((folder) => folder.id));
  const grouped = new Map<string, boolean>();
  for (const folder of folders) for (const id of folder.sessionIds) grouped.set(id, pinnedFolderIds.has(folder.id));
  const filed: HostSessionSummary[] = [];
  const pinned: HostSessionSummary[] = [];
  const loose: HostSessionSummary[] = [];
  const settled: HostSessionSummary[] = [];
  const snoozed: HostSessionSummary[] = [];
  for (const session of sessions) {
    const pinnedFolder = grouped.get(session.id);
    if (sessionIsSnoozed(session, signals.now)) snoozed.push(session);
    else if (pinnedFolder !== undefined) (pinnedFolder ? pinned : filed).push(session);
    else if (session.pinned) pinned.push(session);
    else if (settledIds.has(session.id) && !isRunningSession(session) && !session.needsInput) settled.push(session);
    // Running loose work joins the folder block so it rises above the folders.
    else (isRunningSession(session) && layout ? filed : loose).push(session);
  }
  const part = (members: HostSessionSummary[], partFolders: typeof folders) =>
    members.length
      ? orderSessionRuns(
          sessionDirectoryRows(members, layout && { ...layout, folders: partFolders }, collapsed, searching),
          signals,
        )
      : [];
  const shelf = (id: "pinned" | "settled" | "snoozed", rows: ProjectSessionRow[], count: number): ProjectSessionRow[] => {
    if (!count) return [];
    const expanded = searching || !(shelfCollapsed[id] ?? (id === "settled" || id === "snoozed"));
    return [{ kind: "header", key: `shelf:${id}`, shelf: id, count, expanded }, ...(expanded ? rows : [])];
  };
  // Each part is ranked on its own so pinned and loose rows never mix.
  return [
    ...part(filed, folders.filter((folder) => !pinnedFolderIds.has(folder.id))),
    ...shelf("pinned", part(pinned, pinnedFolders), pinned.length),
    ...part(loose, []),
    ...shelf("settled", part(settled, []), settled.length),
    ...shelf("snoozed", part(snoozed, []), snoozed.length),
  ];
}
