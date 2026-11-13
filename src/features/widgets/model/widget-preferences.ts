import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

export const WIDGET_PREFERENCES_KEY = "bycoda.mobile.widgets.v1";

export type WidgetPreferences = { showTitles: boolean };

function readWidgetPreferences(raw: string | null): WidgetPreferences {
  if (raw === null) return { showTitles: false };
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null || !("showTitles" in value) || typeof value.showTitles !== "boolean")
    throw new Error("Invalid widget preference");
  return { showTitles: value.showTitles };
}

/** Session titles can be sensitive and widgets sit outside the app lock, so titles default to off. */
export function decodeWidgetPreferences(raw: string | null): WidgetPreferences {
  try {
    return readWidgetPreferences(raw);
  } catch {
    return { showTitles: false };
  }
}

export class WidgetPreferenceStorageError extends Error {
  constructor(readonly operation: "read" | "save") {
    super(`Widget preference ${operation} failed`);
  }
}

type WidgetPreferencesState = WidgetPreferences & {
  hydrated: boolean;
  pending: "read" | "save" | null;
  storageError: WidgetPreferenceStorageError | null;
  hydrate: () => Promise<void>;
  retryStorage: (expectedError: WidgetPreferenceStorageError) => Promise<void>;
  setShowTitles: (showTitles: boolean) => Promise<void>;
};

let hydration: Promise<void> | undefined;
export const useWidgetPreferences = create<WidgetPreferencesState>((set, get) => ({
  showTitles: false,
  hydrated: false,
  pending: null,
  storageError: null,
  hydrate: () => {
    if (hydration) return hydration;
    if (get().hydrated) return Promise.resolve();
    set({ pending: "read" });
    hydration = Promise.resolve()
      .then(() => AsyncStorage.getItem(WIDGET_PREFERENCES_KEY))
      .then(raw => set({ ...readWidgetPreferences(raw), hydrated: true, storageError: null }))
      .catch(() => set({ storageError: new WidgetPreferenceStorageError("read") }))
      .finally(() => { hydration = undefined; set({ pending: null }); });
    return hydration;
  },
  retryStorage: async (expectedError) => {
    if (get().storageError !== expectedError || get().pending) return;
    if (expectedError.operation === "read") await get().hydrate();
    else await get().setShowTitles(get().showTitles);
  },
  setShowTitles: async (showTitles) => {
    // Never replace an unread preference, and admit one persistence operation at a time.
    if (!get().hydrated || get().pending) return;
    set({ showTitles, pending: "save", storageError: null });
    try {
      await AsyncStorage.setItem(WIDGET_PREFERENCES_KEY, JSON.stringify({ showTitles }));
    } catch {
      set({ storageError: new WidgetPreferenceStorageError("save") });
    } finally { set({ pending: null }); }
  },
}));
