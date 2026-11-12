import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

export const WIDGET_PREFERENCES_KEY = "bycoda.mobile.widgets.v1";

export type WidgetPreferences = { showTitles: boolean };

/** Session titles can be sensitive and widgets sit outside the app lock, so titles default to off. */
export function decodeWidgetPreferences(raw: string | null): WidgetPreferences {
  if (raw === null) return { showTitles: false };
  try {
    const value: unknown = JSON.parse(raw);
    const showTitles =
      typeof value === "object" && value !== null && "showTitles" in value && value.showTitles === true;
    return { showTitles };
  } catch {
    return { showTitles: false };
  }
}

type WidgetPreferencesState = WidgetPreferences & {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setShowTitles: (showTitles: boolean) => void;
};

export const useWidgetPreferences = create<WidgetPreferencesState>((set, get) => ({
  showTitles: false,
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    let raw: string | null = null;
    try {
      raw = await AsyncStorage.getItem(WIDGET_PREFERENCES_KEY);
    } catch {
      // Unreadable storage keeps the private default.
    }
    // A toggle made before hydration finished wins over the stored value.
    if (!get().hydrated) set({ ...decodeWidgetPreferences(raw), hydrated: true });
  },
  setShowTitles: (showTitles) => {
    set({ showTitles, hydrated: true });
    void AsyncStorage.setItem(WIDGET_PREFERENCES_KEY, JSON.stringify({ showTitles })).catch(() => {
      // The preference stays in memory for this session; the next toggle retries.
    });
  },
}));
