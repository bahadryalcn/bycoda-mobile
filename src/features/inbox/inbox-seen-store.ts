import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import {
  emptyInboxSeen,
  hasUnseenInboxItems,
  markInboxItemsSeen,
  normalizeInboxSeen,
  type InboxSeenItem,
  type InboxSeenState,
} from "./inbox-seen-model";

export const INBOX_SEEN_KEY = "bycoda.mobile.inbox-seen.v1";
type Storage = Pick<typeof AsyncStorage, "getItem" | "setItem">;

/**
 * Phone-local "last seen" record per computer for the Inbox tab dot. It holds item ids and times only,
 * never item content. An unreadable store stays unseeded, so it can only hide the dot, never nag.
 */
export function createInboxSeenStore(storage: Storage) {
  let loading: Promise<void> | undefined;
  let loaded = false;
  let writes: Promise<unknown> = Promise.resolve();
  return create<{
    machines: Record<string, InboxSeenState>;
    hydrated: boolean;
    hydrate(): Promise<void>;
    markSeen(machineId: string, items: readonly InboxSeenItem[]): Promise<void>;
    /** First sighting only: after hydration, seeds a computer that has no record yet. */
    seedIfNeeded(machineId: string, items: readonly InboxSeenItem[]): Promise<void>;
  }>((set, get) => ({
    machines: {},
    hydrated: false,
    hydrate() {
      if (loaded) return Promise.resolve();
      loading ??= storage
        .getItem(INBOX_SEEN_KEY)
        .then((raw) => {
          let data: unknown;
          try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
          const machines: Record<string, InboxSeenState> = {};
          if (data && typeof data === "object")
            for (const [id, value] of Object.entries(data)) machines[id] = normalizeInboxSeen(value);
          loaded = true;
          set({ machines: { ...machines, ...get().machines } });
        })
        .catch(() => undefined)
        .finally(() => { loading = undefined; set({ hydrated: true }); });
      return loading;
    },
    async seedIfNeeded(machineId, items) {
      await get().hydrate();
      if (loaded && !get().machines[machineId]?.seeded) await get().markSeen(machineId, items);
    },
    async markSeen(machineId, items) {
      await get().hydrate();
      // Never overwrite a store that could not be read.
      if (!loaded) return;
      const current = get().machines[machineId] ?? emptyInboxSeen;
      const next = markInboxItemsSeen(current, items);
      if (next === current) return;
      const machines = { ...get().machines, [machineId]: next };
      set({ machines });
      const snapshot = JSON.stringify(machines);
      const write = writes.catch(() => undefined).then(() => storage.setItem(INBOX_SEEN_KEY, snapshot));
      writes = write;
      await write;
    },
  }));
}

export const useInboxSeen = createInboxSeenStore(AsyncStorage);

/** Whether this computer's attention inbox holds items the owner has not seen. */
export function useInboxHasUnseen(machineId: string | undefined, items: readonly InboxSeenItem[] | undefined): boolean {
  const state = useInboxSeen((s) => (machineId ? s.machines[machineId] : undefined));
  return !!state && !!items && hasUnseenInboxItems(state, items);
}
