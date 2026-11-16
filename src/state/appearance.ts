import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create, useStore } from "zustand";
import { DEFAULT_PALETTE, normalizePalette, type PaletteId } from "../ui/palettes";
import { DEFAULT_TYPOGRAPHY, normalizeTypography, type TypographyPreferences } from "../ui/typography-preferences";

export const THEME_MODES = ["system", "light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export const APPEARANCE_STORAGE_KEY = "bycoda.mobile.appearance.v1";

export class AppearanceStorageError extends Error {
  constructor(readonly operation: "read" | "save") {
    super(operation === "read" ? "Appearance could not be loaded." : "Appearance could not be saved.");
    this.name = "AppearanceStorageError";
  }
}

export function normalizeThemeMode(value: unknown): ThemeMode {
  return THEME_MODES.includes(value as ThemeMode) ? (value as ThemeMode) : "system";
}

export type AppearanceState = {
  themeMode: ThemeMode;
  palette: PaletteId;
  typography: TypographyPreferences;
  hydrated: boolean;
  storageError: Error | null;
  hydrate(): Promise<void>;
  retryStorage(expectedError: Error): Promise<void>;
  setThemeMode(value: ThemeMode): Promise<void>;
  setPalette(value: PaletteId): Promise<void>;
  setTypography(value: Partial<TypographyPreferences>): Promise<void>;
  resetTypography(): Promise<void>;
};

/** Presentation only. Connection credentials and conversation data have separate owners. */
export function createAppearanceStore(storage: Pick<typeof AsyncStorage, "getItem" | "setItem">) {
  let hydration: Promise<void> | undefined;
  let persistence = Promise.resolve();
  let selectionVersion = 0;
  const store = create<AppearanceState>((set, get) => ({
    themeMode: "system",
    palette: DEFAULT_PALETTE,
    typography: DEFAULT_TYPOGRAPHY,
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
            ? (value as { themeMode?: unknown; palette?: unknown; typography?: unknown }) : {};
          set({ themeMode: normalizeThemeMode(stored.themeMode), palette: normalizePalette(stored.palette), typography: normalizeTypography(stored.typography), storageError: null });
        })
        .catch(() => {
          if (version === selectionVersion)
            set({ storageError: new AppearanceStorageError("read") });
        })
        .finally(() => { set({ hydrated: true }); });
      return hydration;
    },
    retryStorage(expectedError) {
      if (get().storageError !== expectedError || !(expectedError instanceof AppearanceStorageError)) return Promise.resolve();
      if (expectedError.operation === "save") return select({});
      hydration = undefined;
      set({ hydrated: false });
      return get().hydrate();
    },
    setThemeMode: (value) => select({ themeMode: normalizeThemeMode(value) }),
    setPalette: (value) => select({ palette: normalizePalette(value) }),
    setTypography: (value) => select({ typography: normalizeTypography({ ...get().typography, ...value }) }),
    resetTypography: () => select({ typography: { ...DEFAULT_TYPOGRAPHY } }),
  }));
  const { getState: get, setState: set } = store;
  async function select(change: Partial<Pick<AppearanceState, "themeMode" | "palette" | "typography">>) {
    if (!get().hydrated) void get().hydrate();
    const version = ++selectionVersion;
    set({ ...change, storageError: null });
    const { themeMode, palette, typography } = get();
    const write = persistence.catch(() => undefined).then(() =>
      storage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ version: 1, themeMode, palette, typography })),
    );
    persistence = write;
    try {
      await write;
      if (version === selectionVersion) set({ storageError: null });
    } catch {
      if (version === selectionVersion)
        set({ storageError: new AppearanceStorageError("save") });
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
