import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import { USAGE_WINDOW_CHOICES, type UsageWindowChoice } from "./usage-widget";

export const USAGE_WIDGET_PREFERENCES_KEY = "bycoda.mobile.widgets.usage.v1";

/** Unreadable or unknown stored values fall back to showing both windows. */
export function decodeUsageWindows(raw: string | null): UsageWindowChoice {
  try {
    const value: unknown = raw === null ? null : JSON.parse(raw);
    const windows = value && typeof value === "object" && "windows" in value ? value.windows : null;
    return USAGE_WINDOW_CHOICES.find((choice) => choice === windows) ?? "both";
  } catch {
    return "both";
  }
}

type UsageWidgetPreferencesState = {
  windows: UsageWindowChoice;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setWindows: (windows: UsageWindowChoice) => Promise<void>;
};

let hydration: Promise<void> | undefined;
export const useUsageWidgetPreferences = create<UsageWidgetPreferencesState>((set, get) => ({
  windows: "both",
  hydrated: false,
  hydrate: () => {
    if (hydration) return hydration;
    if (get().hydrated) return Promise.resolve();
    hydration = Promise.resolve()
      .then(() => AsyncStorage.getItem(USAGE_WIDGET_PREFERENCES_KEY))
      .then((raw) => set({ windows: decodeUsageWindows(raw), hydrated: true }))
      // shortcut: an unreadable choice keeps the default for this launch; no data is lost, upgrade to a visible retry if the setting grows.
      .catch(() => undefined)
      .finally(() => {
        hydration = undefined;
      });
    return hydration;
  },
  setWindows: async (windows) => {
    // Never overwrite a stored choice that has not been read yet.
    if (!get().hydrated) return;
    set({ windows });
    try {
      await AsyncStorage.setItem(USAGE_WIDGET_PREFERENCES_KEY, JSON.stringify({ windows }));
    } catch {
      // shortcut: the choice applies for this session only if the write fails; upgrade with a retry notice.
    }
  },
}));
