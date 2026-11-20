import { CONNECTED_WINDOW_MS } from "@/ui/connection-presentation";
import type { ActiveSession } from "./activity-model";
import { listedSession } from "./session-collection";
import { sessionActivityAt } from "./session-directory";
import { sessionIsSnoozed } from "./session-attention-model";

/**
 * The only instants the overview's counts can change without new data: a snooze ending or a
 * computer's connected window closing. Feed these to `useSnoozeNow` so no per-second clock runs.
 */
export function tabletOverviewWakes(
  directory: readonly ActiveSession[],
  successAts: readonly number[],
): (number | null | undefined)[] {
  return [
    ...directory.map(({ session }) => session.snoozedUntil),
    ...successAts.map((successAt) => (successAt > 0 ? successAt + CONNECTED_WINDOW_MS : null)),
  ];
}

/**
 * True only for a ready directory with no sessions and no loading, waiting, privacy or error state.
 * Those other states stay with the list beside the overview, so the detail pane stays blank for them.
 */
export function tabletDirectoryIsEmpty({ ready, pending, waiting, privacyPending, listOwnsRegion }: {
  ready: boolean;
  pending: boolean;
  waiting: boolean;
  privacyPending: boolean;
  listOwnsRegion: boolean;
}) {
  return ready && !pending && !waiting && !privacyPending && !listOwnsRegion;
}

/** Overview previews share the session list's visibility and turn-activity rules. */
export function tabletOverviewModel(
  directory: readonly ActiveSession[],
  machines: readonly { id: string }[],
  connectedIds: ReadonlySet<string>,
  now: number,
) {
  const visible = directory.filter(({ session }) =>
    listedSession(session) && !session.archived && !sessionIsSnoozed(session, now),
  ).sort((a, b) => sessionActivityAt(b.session) - sessionActivityAt(a.session));
  const attention: ActiveSession[] = [];
  const recent: ActiveSession[] = [];
  let running = 0;
  for (const row of visible) {
    if (row.session.status === "running") running++;
    if (row.session.needsInput || row.session.issue === "failed") attention.push(row);
    else recent.push(row);
  }
  return {
    running,
    attentionCount: attention.length,
    connected: machines.filter((machine) => connectedIds.has(machine.id)).length,
    total: machines.length,
    attention: attention.slice(0, 5),
    recent: recent.slice(0, 6),
  };
}
