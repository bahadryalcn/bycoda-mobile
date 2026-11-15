import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create, useStore } from "zustand";

export type BusySendMode = "steer" | "queue";
/** Matches the desktop: the primary action steers, the alternate action queues. */
export const DEFAULT_BUSY_SEND_MODE: BusySendMode = "steer";
export const BUSY_SEND_STORAGE_KEY = "bycoda.mobile.busy-send.v1";

export function decodeBusySendMode(raw: string | null): BusySendMode {
  return raw === "queue" || raw === "steer" ? raw : DEFAULT_BUSY_SEND_MODE;
}

type PreferenceStorage = Pick<typeof AsyncStorage, "getItem" | "setItem">;
export type BusySendState = {
  mode: BusySendMode;
  hydrated: boolean;
  storageError: Error | null;
  hydrate: () => Promise<void>;
  setMode: (mode: BusySendMode) => Promise<void>;
};

/** Which action the send button performs while the agent runs; presentation of a choice, never content. */
export function createBusySendStore(storage: PreferenceStorage) {
  let chosen = false;
  let hydration: Promise<void> | undefined;
  let persistence = Promise.resolve();
  let version = 0;
  return create<BusySendState>((set, get) => ({
    mode: DEFAULT_BUSY_SEND_MODE,
    hydrated: false,
    storageError: null,
    hydrate: () => {
      if (get().hydrated) return Promise.resolve();
      hydration ??= Promise.resolve()
        .then(() => storage.getItem(BUSY_SEND_STORAGE_KEY))
        // A choice made during hydration wins over the stored value.
        .then((raw) => { if (!chosen) set({ mode: decodeBusySendMode(raw) }); })
        .catch(() => { if (!chosen) set({ storageError: new Error("Send preference could not be loaded.") }); })
        .finally(() => { set({ hydrated: true }); });
      return hydration;
    },
    setMode: async (mode) => {
      chosen = true;
      const selected = ++version;
      set({ mode, storageError: null });
      // Serialize rapid choices so an older write cannot replace the current preference.
      const write = persistence.catch(() => undefined).then(() => storage.setItem(BUSY_SEND_STORAGE_KEY, mode));
      persistence = write;
      await write.catch(() => {
        if (selected === version) set({ storageError: new Error("Send preference could not be saved.") });
      });
    },
  }));
}

export const busySendStore = createBusySendStore(AsyncStorage);

export function useBusySend<T>(selector: (state: BusySendState) => T): T {
  const value = useStore(busySendStore, selector);
  useEffect(() => { void busySendStore.getState().hydrate(); }, []);
  return value;
}
