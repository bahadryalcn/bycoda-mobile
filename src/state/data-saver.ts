import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNetInfo } from "@react-native-community/netinfo";
import { create, useStore } from "zustand";
import {
  DEFAULT_DATA_SAVER_MODE,
  decodeDataSaverMode,
  encodeDataSaverMode,
  isDataSaverActive,
  normalizeDataSaverMode,
} from "./data-saver-model";
import type { DataSaverMode } from "./data-saver-model";
export type { DataSaverMode } from "./data-saver-model";
export { DATA_SAVER_FRAME_QUALITY, DATA_SAVER_MODES } from "./data-saver-model";

export const DATA_SAVER_STORAGE_KEY = "bycoda.mobile.data-saver.v1";

export type DataSaverState = {
  dataSaver: DataSaverMode;
  hydrated: boolean;
  storageError: Error | null;
  hydrate: () => Promise<void>;
  retryStorage: (expectedError: Error) => Promise<void>;
  setDataSaver: (dataSaver: DataSaverMode) => Promise<void>;
};

type PreferenceStorage = Pick<typeof AsyncStorage, "getItem" | "setItem">;

class DataSaverStorageError extends Error {
  constructor(readonly operation: "read" | "save") {
    super(operation === "read" ? "Data saver could not be loaded." : "Data saver could not be saved.");
    this.name = "DataSaverStorageError";
  }
}

/** Network-usage preference only; never content or account state. */
export function createDataSaverStore(storage: PreferenceStorage) {
  let hydration: Promise<void> | undefined;
  let persistence = Promise.resolve();
  let version = 0;
  return create<DataSaverState>((set, get) => {
    const read = (retry = false): Promise<void> => {
      if (hydration) return hydration;
      if (!retry && get().hydrated) return Promise.resolve();
      const selected = version;
      hydration = Promise.resolve()
        .then(() => storage.getItem(DATA_SAVER_STORAGE_KEY))
        .then((raw) => {
          if (selected === version) set({ dataSaver: decodeDataSaverMode(raw), storageError: null });
        })
        .catch(() => {
          if (selected === version) set({ storageError: new DataSaverStorageError("read") });
        })
        .finally(() => {
          hydration = undefined;
          set({ hydrated: true });
        });
      return hydration;
    };
    return {
      dataSaver: DEFAULT_DATA_SAVER_MODE,
      hydrated: false,
      storageError: null,
      hydrate: () => read(),
      retryStorage: (expectedError) => {
        const error = get().storageError;
        if (error !== expectedError || !(error instanceof DataSaverStorageError)) return Promise.resolve();
        return error.operation === "read" ? read(true) : get().setDataSaver(get().dataSaver);
      },
      setDataSaver: async (value) => {
        // A choice made during hydration wins over the older stored value.
        if (!get().hydrated) void get().hydrate();
        const selected = ++version;
        const dataSaver = normalizeDataSaverMode(value);
        set({ dataSaver, storageError: null });
        const write = persistence
          .catch(() => undefined)
          .then(() => storage.setItem(DATA_SAVER_STORAGE_KEY, encodeDataSaverMode(dataSaver)));
        persistence = write;
        try {
          await write;
        } catch {
          if (selected === version) set({ storageError: new DataSaverStorageError("save") });
        }
      },
    };
  });
}

export const dataSaverStore = createDataSaverStore(AsyncStorage);

/** Hydration starts once per consumer mount; selectors keep renders scoped. */
export function useDataSaver<Selected>(selector: (state: DataSaverState) => Selected): Selected {
  const value = useStore(dataSaverStore, selector);
  // Hydrate the stored preference for any screen that reads it.
  useEffect(() => {
    void dataSaverStore.getState().hydrate();
  }, []);
  return value;
}

/** True when heavy media and Host browser frames should shrink; also meant for a future loopback tunnel WebView. */
export function useDataSaverActive(): boolean {
  const mode = useDataSaver((state) => state.dataSaver);
  const network = useNetInfo();
  return isDataSaverActive(mode, network);
}
