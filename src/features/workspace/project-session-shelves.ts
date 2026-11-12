import type { HostSessionSummary } from "@/domain/types";
import { shelfOf, type SessionShelfId, type SessionShelfRow } from "./session-collection";
import { sessionDirectoryRows, type SessionDirectoryRow, type SessionLayout } from "./session-directory";

export type ProjectSessionRow = SessionDirectoryRow | Extract<SessionShelfRow, { kind: "header" }>;

/**
 * Project Sessions tab order: Pinned on top, the organized directory, then a collapsed
 * Settled group. Settled and pinned sessions are lifted out of folders so each shelf is flat.
 */
export function projectSessionRows(
  sessions: readonly HostSessionSummary[],
  layout: SessionLayout | undefined,
  collapsed: Readonly<Record<string, boolean>>,
  shelfCollapsed: Readonly<Partial<Record<SessionShelfId, boolean>>>,
  searching: boolean,
  settledIds: ReadonlySet<string>,
  archived: boolean,
): ProjectSessionRow[] {
  if (archived) return sessionDirectoryRows(sessions, layout, collapsed, searching);
  const pinned: HostSessionSummary[] = [];
  const settled: HostSessionSummary[] = [];
  const rest: HostSessionSummary[] = [];
  for (const session of sessions) {
    const shelf = shelfOf(session as never, false, settledIds);
    (shelf === "pinned" ? pinned : shelf === "settled" ? settled : rest).push(session);
  }
  const shelf = (id: "pinned" | "settled", members: HostSessionSummary[]): ProjectSessionRow[] => {
    if (!members.length) return [];
    const expanded = searching || !(shelfCollapsed[id] ?? id === "settled");
    return [
      { kind: "header", key: `shelf:${id}`, shelf: id, count: members.length, expanded },
      ...(expanded ? sessionDirectoryRows(members, undefined, {}, false) : []),
    ];
  };
  return [
    ...shelf("pinned", pinned),
    ...sessionDirectoryRows(rest, layout, collapsed, searching),
    ...shelf("settled", settled),
  ];
}
