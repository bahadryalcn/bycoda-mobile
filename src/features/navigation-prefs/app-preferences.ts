import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useStore } from "zustand";
import { createPreferenceStore } from "@/state/preference-store";
import { defaultTabPreferences, normalizeTabPreferences, type TabPreferences } from "./tab-preferences";

export const SESSION_LIST_DENSITIES = ["compact", "standard", "detailed"] as const;
export type SessionListDensity = (typeof SESSION_LIST_DENSITIES)[number];

/**
 * The Sessions tab's own view. It never follows the app-wide project scope that Tools and
 * Management set. The project filter is kept per computer (`machineId` → project id; a missing
 * entry is All projects) because project ids belong to one Host and must never narrow another
 * computer's list. `collapsed` holds explicit section choices (`shelf:<id>`, `project:<id>`);
 * sections without an entry use their default.
 */
export type SessionListPreferences = {
  density: SessionListDensity;
  groupByProject: boolean;
  projectByMachine: Record<string, string>;
  collapsed: Record<string, boolean>;
};
export const defaultSessionListPreferences: SessionListPreferences = {
  density: "standard",
  groupByProject: false,
  projectByMachine: {},
  collapsed: {},
};

/** Phone-local app preferences that are not tied to one computer. */
export type AppPreferences = {
  sessions: SessionListPreferences;
  tabs: TabPreferences;
  /** Projects list: show projects and worktrees that share a repository together. */
  groupByRepository: boolean;
  /** New-session sheet preselects the most recently used project. */
  newSessionUsesLastProject: boolean;
};
export const defaultAppPreferences: AppPreferences = {
  sessions: defaultSessionListPreferences,
  tabs: defaultTabPreferences,
  groupByRepository: false,
  newSessionUsesLastProject: false,
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Records stored before the Sessions view existed, or damaged values, load as the defaults. */
export function normalizeSessionListPreferences(value: unknown): SessionListPreferences {
  const data = record(value);
  const density = SESSION_LIST_DENSITIES.find((entry) => entry === data.density) ?? defaultSessionListPreferences.density;
  const projectByMachine: Record<string, string> = {};
  for (const [machineId, projectId] of Object.entries(record(data.projectByMachine)))
    if (machineId && machineId !== "__proto__" && typeof projectId === "string" && projectId) projectByMachine[machineId] = projectId;
  const collapsed: Record<string, boolean> = {};
  for (const [key, folded] of Object.entries(record(data.collapsed)))
    if (key !== "__proto__" && typeof folded === "boolean") collapsed[key] = folded;
  return { density, groupByProject: data.groupByProject === true, projectByMachine, collapsed };
}

/** The computer's saved Sessions project filter; `null` is All projects. */
export function sessionListProject(preferences: SessionListPreferences, machineId: string | null | undefined): string | null {
  return (machineId && Object.prototype.hasOwnProperty.call(preferences.projectByMachine, machineId)
    && preferences.projectByMachine[machineId]) || null;
}

/** A Sessions-view patch applied over the current record, so a concurrent change to another field survives. */
export function updateSessionListPreferences(
  patch: Partial<SessionListPreferences> | ((current: SessionListPreferences) => Partial<SessionListPreferences>),
) {
  return appPreferences.getState().update((current) => ({
    sessions: { ...current.sessions, ...(typeof patch === "function" ? patch(current.sessions) : patch) },
  }));
}

export function setSessionListProject(machineId: string, projectId: string | null) {
  return updateSessionListPreferences((current) => {
    const projectByMachine = { ...current.projectByMachine };
    if (projectId) projectByMachine[machineId] = projectId;
    else delete projectByMachine[machineId];
    return { projectByMachine };
  });
}

const storageKey = "bycoda.mobile.app-preferences.v1";

export function normalizeAppPreferences(value: unknown): AppPreferences {
  const data = value && typeof value === "object" ? (value as Partial<Record<keyof AppPreferences, unknown>>) : {};
  return {
    sessions: normalizeSessionListPreferences(data.sessions),
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
