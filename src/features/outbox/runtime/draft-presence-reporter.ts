import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useHostClient } from "@/state/queries";
import { isAppContentVisible, useSecurity } from "@/state/security";
import { subscribeDraftPresenceChanges } from "@/state/local-draft-storage";
import { decodeComposerDraft, encodeComposerDraft } from "../../workspace/composer-draft";
import { flushWorkspaceDrafts } from "../../workspace/draft-guard";
import { sendOutbox } from "./store";

const connected = new Set<(machineId: string) => void>();
/** Existing socket owner signals ready; never acquires another socket. */
export function draftPresenceConnected(machineId: string): void {
  for (const listener of connected) listener(machineId);
}

export function draftPresenceSnapshot(machineId: string, entries: ReadonlyArray<readonly [string, string | null]>, queued: ReadonlyArray<{ machineId: string; sessionId: string; status: string }>): string[] {
  const prefix = `bycoda.mobile.draft.v1:${machineId}:`;
  const ids = entries.flatMap(([key, raw]) => key.startsWith(prefix) && raw !== null &&
    encodeComposerDraft(decodeComposerDraft(raw)) !== null ? [key.slice(prefix.length)] : []);
  for (const row of queued) if (row.machineId === machineId && row.status !== "delivered" && row.status !== "dropped") ids.push(row.sessionId);
  return [...new Set(ids)].sort();
}
export function draftPresenceChanged(previous: readonly string[] | undefined, next: readonly string[]): boolean {
  return previous === undefined || JSON.stringify(previous) !== JSON.stringify(next);
}

/** Unchanged snapshots are renewed slightly inside the Host's 30 s presence lifetime. */
export const DRAFT_PRESENCE_RENEW_MS = 25_000;
const DEBOUNCE_MS = 400, BACKOFF_BASE_MS = 2_000, BACKOFF_MAX_MS = 60_000;
/** Delay before retry number `failures` (1-based) of a failed scan or report. */
export const draftPresenceBackoff = (failures: number) => Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);

export type DraftPresenceSource = {
  machineId: string;
  storage: {
    getAllKeys(): Promise<readonly string[]>;
    multiGet(keys: readonly string[]): Promise<ReadonlyArray<readonly [string, string | null]>>;
  };
  outbox: { all(): Promise<ReadonlyArray<{ machineId: string; sessionId: string; status: string }>>; subscribe(listener: () => void): () => void };
  /** Persists unsaved mounted composers so the scan sees them. */
  flush(): Promise<void>;
  report(sessionIds: string[]): Promise<unknown>;
  /** False while locked, backgrounded or hidden; runs then do nothing. */
  current(): boolean;
};

/**
 * Event-driven: a run starts on cold start, a draft presence flip or cleanup, an outbox change, a
 * host reconnect, or the renewal timer. Idle time costs nothing; failures back off exponentially.
 */
export function startDraftPresenceReporting(source: DraftPresenceSource): () => void {
  const prefix = `bycoda.mobile.draft.v1:${source.machineId}:`;
  let stopped = false, flight = false, again = false, renewDue = false, failures = 0, retryAt = 0;
  let previous: string[] | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined, renewal: ReturnType<typeof setTimeout> | undefined;
  const live = () => !stopped && source.current();
  const run = async () => {
    if (!live()) return;
    // A trigger during a run may describe a write the scan already passed; rerun once afterwards.
    if (flight) { again = true; return; }
    flight = true;
    try {
      await source.flush();
      const keys = (await source.storage.getAllKeys()).filter(key => key.startsWith(prefix));
      const entries = keys.length ? await source.storage.multiGet(keys) : [];
      const sessionIds = draftPresenceSnapshot(source.machineId, entries, await source.outbox.all());
      if (!live() || (!renewDue && !draftPresenceChanged(previous, sessionIds))) return;
      await source.report(sessionIds);
      if (stopped) return;
      previous = sessionIds; renewDue = false; failures = 0; retryAt = 0;
      clearTimeout(renewal);
      renewal = setTimeout(() => { renewDue = true; schedule(); }, DRAFT_PRESENCE_RENEW_MS);
    } catch {
      // `previous` and `renewDue` stay as they were, so the retry reports again.
      failures++; retryAt = Date.now() + draftPresenceBackoff(failures); again = true;
    } finally {
      flight = false;
      if (again && !stopped) { again = false; schedule(); }
    }
  };
  function schedule() {
    if (stopped) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => { void run().catch(() => {}); }, Math.max(DEBOUNCE_MS, retryAt - Date.now()));
  }
  const outbox = source.outbox.subscribe(schedule);
  const changes = subscribeDraftPresenceChanges(source.storage, key => { if (key === null || key.startsWith(prefix)) schedule(); });
  const onConnected = (machineId: string) => {
    if (machineId === source.machineId) { previous = undefined; failures = 0; retryAt = 0; schedule(); }
  };
  connected.add(onConnected);
  void run().catch(() => {});
  return () => {
    stopped = true; clearTimeout(debounce); clearTimeout(renewal); outbox(); changes();
    connected.delete(onConnected);
  };
}

/** Mounted inside existing security/account providers; never opens a second transport. */
export function DraftPresenceReporter() {
  const client = useHostClient();
  const unlocked = useSecurity(state => state.status === "unlocked" && state.appState === "active");
  // Starts the event-driven reporter for the connected computer; it stops on lock, background or switch.
  useEffect(() => {
    if (!client || !unlocked) return;
    return startDraftPresenceReporting({
      machineId: client.machine.id, storage: AsyncStorage, outbox: sendOutbox, flush: flushWorkspaceDrafts,
      report: sessionIds => client.request("drafts.presence.report", { clientId: "mobile", sessionIds, complete: true }, { retry: false }),
      current: () => useSecurity.getState().status === "unlocked" && useSecurity.getState().appState === "active" && isAppContentVisible(),
    });
  }, [client, unlocked]);
  return null;
}
