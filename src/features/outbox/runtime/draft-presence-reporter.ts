import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useHostClient } from "@/state/queries";
import { isAppContentVisible, useSecurity } from "@/state/security";
import { subscribeDraftPresence } from "@/state/local-draft-storage";
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

/** Mounted inside existing security/account providers; never opens a second transport. */
export function DraftPresenceReporter() {
  const client = useHostClient();
  const unlocked = useSecurity(state => state.status === "unlocked" && state.appState === "active");
  // Observe persisted edits, reconnects and foreground; flushing includes unsaved mounted composers.
  useEffect(() => {
    if (!client || !unlocked) return;
    let stopped = false, flight = false;
    let previous: string[] | undefined, lastReport = 0;
    const subscriptions = new Map<string, () => void>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const current = () => !stopped && useSecurity.getState().status === "unlocked" &&
      useSecurity.getState().appState === "active" && isAppContentVisible();
    const run = async () => {
      if (!current() || flight) return;
      flight = true;
      try {
        await flushWorkspaceDrafts();
        const prefix = `bycoda.mobile.draft.v1:${client.machine.id}:`;
        const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(prefix));
        for (const key of keys) if (!subscriptions.has(key)) subscriptions.set(key, subscribeDraftPresence(AsyncStorage, key, schedule));
        const entries = await AsyncStorage.multiGet(keys);
        const sessionIds = draftPresenceSnapshot(client.machine.id, entries, await sendOutbox.all());
        if (!current() || (!draftPresenceChanged(previous, sessionIds) && Date.now() - lastReport < 30_000)) return;
        await client.request("drafts.presence.report", { clientId: "mobile", sessionIds, complete: true }, { retry: false });
        previous = sessionIds; lastReport = Date.now();
      } finally { flight = false; }
    };
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(() => { void run().catch(() => {}); }, 400);
    }
    const outbox = sendOutbox.subscribe(schedule);
    const onConnected = (machineId: string) => {
      if (machineId === client.machine.id) { previous = undefined; schedule(); }
    };
    connected.add(onConnected);
    // Discover new persisted keys, retry failures, and renew unchanged snapshots.
    const heartbeat = setInterval(() => { void run().catch(() => {}); }, 1000);
    void run().catch(() => {});
    return () => {
      stopped = true; clearInterval(heartbeat); clearTimeout(timer); outbox();
      connected.delete(onConnected);
      for (const unsubscribe of subscriptions.values()) unsubscribe();
    };
  }, [client, unlocked]);
  return null;
}
