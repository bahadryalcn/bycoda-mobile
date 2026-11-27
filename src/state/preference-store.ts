import type AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createSingleFlight } from "./single-flight";

type PreferenceStorage = Pick<typeof AsyncStorage, "getItem" | "setItem">;
export type PreferenceStorageOperation = "read" | "save";

/** A phone-local preference could not be read from, or written to, device storage. */
export class PreferenceStorageError extends Error {
  readonly operation: PreferenceStorageOperation;
  /** The stored record was unreadable data: defaults are shown and a retry saves them over it. */
  readonly corrupt: boolean;
  constructor(operation: PreferenceStorageOperation, corrupt = false) {
    super(`Preference ${operation} failed`);
    this.name = "PreferenceStorageError";
    this.operation = operation;
    this.corrupt = corrupt;
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
  const retryFlight = createSingleFlight<void>();
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
        .then(async (raw) => {
          let stored: unknown = {};
          let corrupt = false;
          try { stored = raw ? JSON.parse(raw) : {}; } catch { corrupt = true; }
          const base = stored && typeof stored === "object" ? stored : {};
          const preferences = normalize({ ...base, ...unsaved });
          loaded = true;
          if (corrupt) {
            // A damaged record is never silently replaced: the user is told settings were reset,
            // and the next change or a retry saves the shown values over it.
            console.warn(`Preference record ${key} was unreadable; defaults are shown.`);
            set({ preferences, storageError: new PreferenceStorageError("read", true) });
            if (Object.keys(unsaved).length > 0) await save();
          } else if (Object.keys(unsaved).length > 0) {
            set({ preferences });
            await save();
          } else {
            set({ preferences, storageError: null });
          }
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
      retry: () => retryFlight.run(async () => {
        const error = get().storageError;
        if (!error) return;
        await (error.operation === "read" && !error.corrupt ? hydration ?? read() : save());
      }),
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
