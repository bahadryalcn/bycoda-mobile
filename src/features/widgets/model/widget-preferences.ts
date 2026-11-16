import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

export const WIDGET_PREFERENCES_KEY = "bycoda.mobile.widgets.v1";

export type WidgetPreferences = { showTitles: boolean; showQuestionText: boolean };

function readWidgetPreferences(raw: string | null): WidgetPreferences {
  if (raw === null) return { showTitles: false, showQuestionText: false };
  const value: unknown = JSON.parse(raw);
  if (
    typeof value !== "object" ||
    value === null ||
    !("showTitles" in value) ||
    typeof value.showTitles !== "boolean"
  )
    throw new Error("Invalid widget preference");
  if ("showQuestionText" in value && typeof value.showQuestionText !== "boolean")
    throw new Error("Invalid widget preference");
  return {
    showTitles: value.showTitles,
    showQuestionText: "showQuestionText" in value && value.showQuestionText === true,
  };
}

/** Session titles can be sensitive and widgets sit outside the app lock, so titles default to off. */
export function decodeWidgetPreferences(raw: string | null): WidgetPreferences {
  try {
    return readWidgetPreferences(raw);
  } catch {
    return { showTitles: false, showQuestionText: false };
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
  setShowQuestionText: (value: boolean) => Promise<void>;
  save: (preferences: WidgetPreferences) => Promise<void>;
  setShowTitles: (showTitles: boolean) => Promise<void>;
};

let hydration: Promise<void> | undefined;
export const useWidgetPreferences = create<WidgetPreferencesState>((set, get) => ({
  showTitles: false,
  showQuestionText: false,
  hydrated: false,
  pending: null,
  storageError: null,
  hydrate: () => {
    if (hydration) return hydration;
    if (get().hydrated) return Promise.resolve();
    set({ pending: "read" });
    hydration = Promise.resolve()
      .then(() => AsyncStorage.getItem(WIDGET_PREFERENCES_KEY))
      .then((raw) => set({ ...readWidgetPreferences(raw), hydrated: true, storageError: null }))
      .catch(() => set({ storageError: new WidgetPreferenceStorageError("read") }))
      .finally(() => {
        hydration = undefined;
        set({ pending: null });
      });
    return hydration;
  },
  retryStorage: async (expectedError) => {
    if (get().storageError !== expectedError || get().pending) return;
    if (expectedError.operation === "read") await get().hydrate();
    else
      await get().save({ showTitles: get().showTitles, showQuestionText: get().showQuestionText });
  },
  setShowTitles: (showTitles) =>
    get().save({ showTitles, showQuestionText: get().showQuestionText }),
  setShowQuestionText: (showQuestionText) =>
    get().save({ showTitles: get().showTitles, showQuestionText }),
  save: async (preferences) => {
    // Never replace an unread preference, and admit one persistence operation at a time.
    if (!get().hydrated || get().pending) return;
    set({ ...preferences, pending: "save", storageError: null });
    try {
      await AsyncStorage.setItem(WIDGET_PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {
      set({ storageError: new WidgetPreferenceStorageError("save") });
    } finally {
      set({ pending: null });
    }
  },
}));
