import { useSyncExternalStore } from "react";
import { nextUnseenFinishedSessions } from "../../../../src/features/sessions/model/sessionDone";

type MachineDone = { running: Set<string>; unseen: ReadonlySet<string>; opened?: string };

const machines = new Map<string, MachineDone>();
const listeners = new Set<() => void>();
const EMPTY: ReadonlySet<string> = new Set();

function machine(machineId: string): MachineDone {
  let state = machines.get(machineId);
  if (!state) machines.set(machineId, (state = { running: new Set(), unseen: EMPTY }));
  return state;
}
function publish(state: MachineDone, unseen: ReadonlySet<string>) {
  const same = unseen.size === state.unseen.size && [...unseen].every((id) => state.unseen.has(id));
  if (same) return;
  state.unseen = unseen;
  for (const listener of listeners) listener();
}

/**
 * Records observed run states; a session seen running and then idle becomes unseen Done,
 * unless it is the session the owner last opened (desktop's active session never turns Done).
 * shortcut: rows observe themselves, so a run that starts and ends while its row is never
 * mounted is missed; feed whole lists from the screens to close that gap.
 */
export function observeSessionRuns(
  machineId: string,
  sessions: readonly { id: string; status: string }[],
) {
  const state = machine(machineId);
  const previousBusyIds = new Set(sessions.filter(({ id }) => state.running.has(id)).map(({ id }) => id));
  const busyIds = new Set(sessions.filter(({ status }) => status === "running").map(({ id }) => id));
  for (const { id } of sessions) {
    if (busyIds.has(id)) state.running.add(id);
    else state.running.delete(id);
  }
  publish(
    state,
    nextUnseenFinishedSessions({
      previousBusyIds,
      busyIds,
      previousUnseenIds: state.unseen,
      focusedSessionId: state.opened,
    }),
  );
}

/** Opening a session marks it seen and keeps it from turning Done while it stays the open one. */
export function openSessionSeen(machineId: string, sessionId: string) {
  const state = machine(machineId);
  state.opened = sessionId;
  if (!state.unseen.has(sessionId)) return;
  publish(state, new Set([...state.unseen].filter((id) => id !== sessionId)));
}

export function unseenDoneIds(machineId: string): ReadonlySet<string> {
  return machines.get(machineId)?.unseen ?? EMPTY;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Unseen finished sessions of one machine, for list ordering. */
export function useUnseenDoneIds(machineId: string): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => unseenDoneIds(machineId), () => EMPTY);
}

export function useUnseenDone(machineId: string, sessionId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => unseenDoneIds(machineId).has(sessionId),
    () => false,
  );
}

/** Test seam: forget every machine's observations. */
export function resetSessionDoneStore() {
  machines.clear();
}
