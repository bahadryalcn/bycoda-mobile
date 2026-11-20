import type AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

type PreferenceStorage = Pick<typeof AsyncStorage, "getItem" | "setItem">;
export type PreferenceStorageOperation = "read" | "save";

/** A phone-local preference could not be read from, or written to, device storage. */
export class PreferenceStorageError extends Error {
  readonly operation: PreferenceStorageOperation;
  constructor(operation: PreferenceStorageOperation) {
    super(`Preference ${operation} failed`);
    this.name = "PreferenceStorageError";
    this.operation = operation;
  }
}

export type PreferenceState<P> = {
  preferences: P;
  hydrated: boolean;
  storageError: PreferenceStorageError | null;
  hydrate: () => Promise<void>;
  /** Repeats the failed operation: a read merges held choices over the stored record, a save writes the whole record. */
  retry: () => Promise<void>;
  update: (patch: Partial<P> | ((current: P) => Partial<P>)) => Promise<void>;
};

type PreferenceOptions<P> = {
  key: string;
  storage: PreferenceStorage;
  defaults: P;
  normalize: (value: unknown) => P;
};

/**
 * A phone-local preference record that never reports a change it did not persist.
 * A failed read keeps defaults and holds the user's choices in memory; nothing is written until a read
 * succeeds, and then the held choices win over the stored record and are saved. A failed save keeps the
 * choice on screen with a save error until a retry writes the whole record.
 */
export function createPreferenceStore<P>({ key, storage, defaults, normalize }: PreferenceOptions<P>) {
  let hydration: Promise<void> | undefined;
  let persistence: Promise<unknown> = Promise.resolve();
  let loaded = false;
  let selection = 0;
  // Choices not yet confirmed by a successful save; the next successful read applies them over the stored record.
  let unsaved: Partial<P> = {};
  return create<PreferenceState<P>>((set, get) => {
    const save = async (): Promise<void> => {
      const version = ++selection;
      const snapshot = JSON.stringify(get().preferences);
      const write = persistence.catch(() => undefined).then(() => storage.setItem(key, snapshot));
      persistence = write;
      try {
        await write;
        if (version === selection) {
          unsaved = {};
          set({ storageError: null });
        }
      } catch {
        if (version === selection) set({ storageError: new PreferenceStorageError("save") });
      }
    };
    const read = (): Promise<void> => {
      if (loaded) return Promise.resolve();
      hydration ??= Promise.resolve()
        .then(() => storage.getItem(key))
        .then((raw) => {
          let stored: unknown = {};
          try { stored = raw ? JSON.parse(raw) : {}; } catch { stored = {}; }
          const base = stored && typeof stored === "object" ? stored : {};
          loaded = true;
          set({ preferences: normalize({ ...base, ...unsaved }), storageError: null });
          if (Object.keys(unsaved).length > 0) void save();
        })
        .catch(() => {
          set({ storageError: new PreferenceStorageError("read") });
        })
        .finally(() => {
          hydration = undefined;
          set({ hydrated: true });
        });
      return hydration;
    };
    return {
      preferences: defaults,
      hydrated: false,
      storageError: null,
      hydrate: () => read(),
      retry: () => {
        const error = get().storageError;
        if (!error) return Promise.resolve();
        return error.operation === "read" ? read() : save();
      },
      update: async (patch) => {
        await read();
        const current = get().preferences;
        const change = typeof patch === "function" ? patch(current) : patch;
        unsaved = { ...unsaved, ...change };
        set({ preferences: normalize({ ...current, ...change }) });
        // Nothing is written before the stored record has been read, so unknown values are never overwritten.
        if (loaded) await save();
      },
    };
  });
}
