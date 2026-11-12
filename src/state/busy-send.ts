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
  hydrate: () => Promise<void>;
  setMode: (mode: BusySendMode) => Promise<void>;
};

/** Which action the send button performs while the agent runs; presentation of a choice, never content. */
export function createBusySendStore(storage: PreferenceStorage) {
  let chosen = false;
  let hydration: Promise<void> | undefined;
  return create<BusySendState>((set, get) => ({
    mode: DEFAULT_BUSY_SEND_MODE,
    hydrated: false,
    hydrate: () => {
      if (get().hydrated) return Promise.resolve();
      hydration ??= Promise.resolve()
        .then(() => storage.getItem(BUSY_SEND_STORAGE_KEY))
        // A choice made during hydration wins over the stored value.
        .then((raw) => { if (!chosen) set({ mode: decodeBusySendMode(raw) }); })
        .catch(() => {})
        .finally(() => { set({ hydrated: true }); });
      return hydration;
    },
    setMode: async (mode) => {
      chosen = true;
      set({ mode });
      // A failed save keeps the choice for this launch; the next change retries.
      await Promise.resolve().then(() => storage.setItem(BUSY_SEND_STORAGE_KEY, mode)).catch(() => {});
    },
  }));
}

export const busySendStore = createBusySendStore(AsyncStorage);

export function useBusySend<T>(selector: (state: BusySendState) => T): T {
  const value = useStore(busySendStore, selector);
  useEffect(() => { void busySendStore.getState().hydrate(); }, []);
  return value;
}
