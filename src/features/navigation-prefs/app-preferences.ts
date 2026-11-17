import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create, useStore } from "zustand";
import { defaultTabPreferences, normalizeTabPreferences, type TabPreferences } from "./tab-preferences";

/** Phone-local app preferences that are not tied to one computer. */
export type AppPreferences = {
  tabs: TabPreferences;
  /** Projects list: show projects and worktrees that share a repository together. */
  groupByRepository: boolean;
  /** New-session sheet preselects the most recently used project. */
  newSessionUsesLastProject: boolean;
};
export const defaultAppPreferences: AppPreferences = {
  tabs: defaultTabPreferences,
  groupByRepository: false,
  newSessionUsesLastProject: false,
};
const storageKey = "bycoda.mobile.app-preferences.v1";

export function normalizeAppPreferences(value: unknown): AppPreferences {
  const data = value && typeof value === "object" ? (value as Partial<Record<keyof AppPreferences, unknown>>) : {};
  return {
    tabs: normalizeTabPreferences(data.tabs),
    groupByRepository: data.groupByRepository === true,
    newSessionUsesLastProject: data.newSessionUsesLastProject === true,
  };
}

export function createAppPreferenceStore(storage: Pick<typeof AsyncStorage, "getItem" | "setItem">) {
  let loading: Promise<void> | undefined;
  let writes: Promise<unknown> = Promise.resolve();
  let loaded = false;
  return create<{
    preferences: AppPreferences;
    hydrated: boolean;
    hydrate(): Promise<void>;
    update(patch: Partial<AppPreferences> | ((current: AppPreferences) => Partial<AppPreferences>)): Promise<void>;
  }>((set, get) => ({
    preferences: defaultAppPreferences,
    hydrated: false,
    hydrate() {
      if (loaded) return Promise.resolve();
      if (loading) return loading;
      loading = storage
        .getItem(storageKey)
        .then((raw) => {
          let data: unknown;
          try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
          loaded = true;
          set({ preferences: normalizeAppPreferences(data) });
        })
        // An unreadable store keeps defaults; the next successful read retries.
        .catch(() => undefined)
        .finally(() => { loading = undefined; set({ hydrated: true }); });
      return loading;
    },
    async update(patch) {
      await get().hydrate();
      // Never overwrite stored values that could not be read.
      if (!loaded) return;
      const current = get().preferences;
      const next = normalizeAppPreferences({ ...current, ...(typeof patch === "function" ? patch(current) : patch) });
      set({ preferences: next });
      const snapshot = JSON.stringify(next);
      const write = writes.catch(() => undefined).then(() => storage.setItem(storageKey, snapshot));
      writes = write;
      await write;
    },
  }));
}

export const appPreferences = createAppPreferenceStore(AsyncStorage);

export function useAppPreferences() {
  const preferences = useStore(appPreferences, (state) => state.preferences);
  const hydrated = useStore(appPreferences, (state) => state.hydrated);
  // Reads the stored preferences once per mount; the store ignores repeat calls.
  useEffect(() => { void appPreferences.getState().hydrate(); }, []);
  return { preferences, hydrated };
}
