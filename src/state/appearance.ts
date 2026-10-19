import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

export const THEME_MODES = ["system", "light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export const APPEARANCE_STORAGE_KEY = "bycoda.mobile.appearance.v1";

export function normalizeThemeMode(value: unknown): ThemeMode {
  return THEME_MODES.includes(value as ThemeMode) ? (value as ThemeMode) : "system";
}

export type AppearanceState = {
  themeMode: ThemeMode;
  hydrated: boolean;
  storageError: Error | null;
  hydrate(): Promise<void>;
  setThemeMode(value: ThemeMode): Promise<void>;
};

/** Presentation only. Connection credentials and conversation data have separate owners. */
export function createAppearanceStore(storage: Pick<typeof AsyncStorage, "getItem" | "setItem">) {
  let hydration: Promise<void> | undefined;
  let persistence = Promise.resolve();
  let selectionVersion = 0;
  return create<AppearanceState>((set, get) => ({
    themeMode: "system",
    hydrated: false,
    storageError: null,
    hydrate() {
      if (get().hydrated) return Promise.resolve();
      if (hydration) return hydration;
      const version = selectionVersion;
      hydration = Promise.resolve()
        .then(() => storage.getItem(APPEARANCE_STORAGE_KEY))
        .then((raw) => {
          if (version !== selectionVersion) return;
          let value: unknown;
          try { value = raw ? JSON.parse(raw) : null; } catch { value = null; }
          const mode = value && typeof value === "object" && !Array.isArray(value)
            ? (value as { themeMode?: unknown }).themeMode : undefined;
          set({ themeMode: normalizeThemeMode(mode), storageError: null });
        })
        .catch(() => {
          if (version === selectionVersion)
            set({ storageError: new Error("Appearance could not be loaded.") });
        })
        .finally(() => { set({ hydrated: true }); });
      return hydration;
    },
    async setThemeMode(value) {
      if (!get().hydrated) void get().hydrate();
      const version = ++selectionVersion;
      const themeMode = normalizeThemeMode(value);
      set({ themeMode, storageError: null });
      const write = persistence.catch(() => undefined).then(() =>
        storage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ version: 1, themeMode })),
      );
      persistence = write;
      try {
        await write;
        if (version === selectionVersion) set({ storageError: null });
      } catch {
        if (version === selectionVersion)
          set({ storageError: new Error("Appearance could not be saved.") });
      }
    },
  }));
}

export const appearanceStore = createAppearanceStore(AsyncStorage);
export function useAppearance<Selected>(selector: (state: AppearanceState) => Selected): Selected {
  const value = appearanceStore(selector);
  useEffect(() => { void appearanceStore.getState().hydrate(); }, []);
  return value;
}
