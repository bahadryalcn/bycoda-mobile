import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create, useStore } from "zustand";
import { DEFAULT_PALETTE, normalizePalette, type PaletteId } from "../ui/palettes";

export const THEME_MODES = ["system", "light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export const APPEARANCE_STORAGE_KEY = "bycoda.mobile.appearance.v1";

export function normalizeThemeMode(value: unknown): ThemeMode {
  return THEME_MODES.includes(value as ThemeMode) ? (value as ThemeMode) : "system";
}

export type AppearanceState = {
  themeMode: ThemeMode;
  palette: PaletteId;
  hydrated: boolean;
  storageError: Error | null;
  hydrate(): Promise<void>;
  setThemeMode(value: ThemeMode): Promise<void>;
  setPalette(value: PaletteId): Promise<void>;
};

/** Presentation only. Connection credentials and conversation data have separate owners. */
export function createAppearanceStore(storage: Pick<typeof AsyncStorage, "getItem" | "setItem">) {
  let hydration: Promise<void> | undefined;
  let persistence = Promise.resolve();
  let selectionVersion = 0;
  const store = create<AppearanceState>((set, get) => ({
    themeMode: "system",
    palette: DEFAULT_PALETTE,
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
          const stored = value && typeof value === "object" && !Array.isArray(value)
            ? (value as { themeMode?: unknown; palette?: unknown }) : {};
          set({ themeMode: normalizeThemeMode(stored.themeMode), palette: normalizePalette(stored.palette), storageError: null });
        })
        .catch(() => {
          if (version === selectionVersion)
            set({ storageError: new Error("Appearance could not be loaded.") });
        })
        .finally(() => { set({ hydrated: true }); });
      return hydration;
    },
    setThemeMode: (value) => select({ themeMode: normalizeThemeMode(value) }),
    setPalette: (value) => select({ palette: normalizePalette(value) }),
  }));
  const { getState: get, setState: set } = store;
  async function select(change: Partial<Pick<AppearanceState, "themeMode" | "palette">>) {
    if (!get().hydrated) void get().hydrate();
    const version = ++selectionVersion;
    set({ ...change, storageError: null });
    const { themeMode, palette } = get();
    const write = persistence.catch(() => undefined).then(() =>
      storage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ version: 1, themeMode, palette })),
    );
    persistence = write;
    try {
      await write;
      if (version === selectionVersion) set({ storageError: null });
    } catch {
      if (version === selectionVersion)
        set({ storageError: new Error("Appearance could not be saved.") });
    }
  }
  return store;
}

export const appearanceStore = createAppearanceStore(AsyncStorage);
export function useAppearance<Selected>(selector: (state: AppearanceState) => Selected): Selected {
  const value = useStore(appearanceStore, selector);
  useEffect(() => { void appearanceStore.getState().hydrate(); }, []);
  return value;
}
