import type { ActiveSession } from "./activity-model";
import { listedSession, sessionActivityAt } from "./session-collection";
import { sessionIsSnoozed } from "./session-attention-model";

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
