import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useStore } from "zustand";
import { createPreferenceStore } from "@/state/preference-store";
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
  return createPreferenceStore<AppPreferences>({
    key: storageKey,
    storage,
    defaults: defaultAppPreferences,
    normalize: normalizeAppPreferences,
  });
}

export const appPreferences = createAppPreferenceStore(AsyncStorage);

export function useAppPreferences() {
  const preferences = useStore(appPreferences, (state) => state.preferences);
  const hydrated = useStore(appPreferences, (state) => state.hydrated);
  const storageError = useStore(appPreferences, (state) => state.storageError);
  const retry = useStore(appPreferences, (state) => state.retry);
  // Reads the stored preferences once per mount; the store ignores repeat calls.
  useEffect(() => { void appPreferences.getState().hydrate(); }, []);
  return { preferences, hydrated, storageError, retry };
}
