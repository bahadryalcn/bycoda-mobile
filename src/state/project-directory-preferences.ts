import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create, useStore } from "zustand";

/** Phone-local custom order. Group key "" is the Others section; `flat` orders the ungrouped list view. */
export type ProjectOrder = { groups: string[]; projects: Record<string, string[]>; flat: string[] };

export const emptyProjectOrder: ProjectOrder = { groups: [], projects: {}, flat: [] };

const maxIdLength = 200;
const maxGroups = 200;
const maxProjects = 2000;

function ids(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item === "string" && item.length <= maxIdLength) seen.add(item);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

export function normalizeProjectOrder(value: unknown): ProjectOrder {
  const data = value && typeof value === "object" ? value as Partial<Record<keyof ProjectOrder, unknown>> : {};
  const projects = data.projects && typeof data.projects === "object" && !Array.isArray(data.projects)
    ? Object.entries(data.projects as Record<string, unknown>).filter(([key]) => key.length <= maxIdLength).slice(0, maxGroups)
    : [];
  return {
    groups: ids(data.groups, maxGroups),
    projects: Object.fromEntries(projects.map(([key, list]) => [key, ids(list, maxProjects)])),
    flat: ids(data.flat, maxProjects),
  };
}

export type ProjectDirectoryPreferences = {
  view: "grouped" | "list";
  sort: "desktop" | "name" | "recent" | "custom";
  order: ProjectOrder;
  fullPaths: boolean;
  collapsed: Record<string, boolean>;
  recent: Record<string, number>;
};
export const defaultProjectDirectoryPreferences: ProjectDirectoryPreferences = {
  view: "grouped", sort: "desktop", fullPaths: false, collapsed: {}, recent: {}, order: emptyProjectOrder,
};
const storageKey = "bycoda.mobile.project-directory.v1";
export function normalizeProjectDirectoryPreferences(value: unknown): ProjectDirectoryPreferences {
  const data = value && typeof value === "object" ? value as Partial<ProjectDirectoryPreferences> : {};
  return {
    view: data.view === "list" ? "list" : "grouped",
    sort: data.sort === "name" || data.sort === "recent" || data.sort === "custom" ? data.sort : "desktop",
    order: normalizeProjectOrder(data.order),
    fullPaths: data.fullPaths === true,
    collapsed: Object.fromEntries(Object.entries(data.collapsed && typeof data.collapsed === "object" ? data.collapsed : {}).filter(([, value]) => typeof value === "boolean")),
    recent: Object.fromEntries(Object.entries(data.recent && typeof data.recent === "object" ? data.recent : {})
      .filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value > 0)
      .sort((a, b) => b[1] - a[1]).slice(0, 50)),
  };
}
export function createProjectDirectoryPreferenceStore(storage: Pick<typeof AsyncStorage, "getItem" | "setItem">) {
  let loading: Promise<void> | undefined;
  let writes = Promise.resolve();
  let loaded = false;
  return create<{
    machines: Record<string, ProjectDirectoryPreferences>;
    hydrated: boolean;
    error: boolean;
    hydrate(): Promise<void>;
    update(machineId: string, patch: Partial<ProjectDirectoryPreferences> | ((current: ProjectDirectoryPreferences) => Partial<ProjectDirectoryPreferences>)): Promise<void>;
  }>((set, get) => ({
    machines: {}, hydrated: false, error: false,
    hydrate() {
      if (loaded) return Promise.resolve();
      if (loading) return loading;
      loading = storage.getItem(storageKey).then((raw) => {
        let data: unknown;
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
        loaded = true;
        set({ machines: Object.fromEntries(Object.entries(data && typeof data === "object" ? data : {})
          .map(([id, value]) => [id, normalizeProjectDirectoryPreferences(value)])), error: false });
      }).catch(() => { set({ error: true }); }).finally(() => { loading = undefined; set({ hydrated: true }); });
      return loading;
    },
    async update(machineId, patch) {
      await get().hydrate();
      if (!loaded) return;
      const current = get().machines[machineId] ?? defaultProjectDirectoryPreferences;
      const next = normalizeProjectDirectoryPreferences({ ...current, ...(typeof patch === "function" ? patch(current) : patch) });
      const machines = { ...get().machines, [machineId]: next };
      set({ machines, error: false });
      const snapshot = JSON.stringify(machines);
      const write = writes.catch(() => {}).then(() => storage.setItem(storageKey, snapshot));
      writes = write;
      try { await write; } catch { set({ error: true }); }
    },
  }));
}
export const projectDirectoryPreferences = createProjectDirectoryPreferenceStore(AsyncStorage);
export function useProjectDirectoryPreferences(machineId: string | undefined) {
  const preferences = useStore(projectDirectoryPreferences, (state) => machineId ? state.machines[machineId] ?? defaultProjectDirectoryPreferences : defaultProjectDirectoryPreferences);
  const hydrated = useStore(projectDirectoryPreferences, (state) => state.hydrated);
  const error = useStore(projectDirectoryPreferences, (state) => state.error);
  useEffect(() => { void projectDirectoryPreferences.getState().hydrate(); }, []);
  return { preferences, hydrated, error };
}
export async function rememberOpenedProject(machineId: string, projectId: string) {
  await projectDirectoryPreferences.getState().update(machineId, (previous) => ({ recent: { ...previous.recent, [projectId]: Date.now() } }));
}
