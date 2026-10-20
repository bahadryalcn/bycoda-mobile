import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

export type ProjectDirectoryPreferences = {
  view: "grouped" | "list";
  sort: "desktop" | "name" | "recent";
  fullPaths: boolean;
  collapsed: Record<string, boolean>;
  recent: Record<string, number>;
};
export const defaultProjectDirectoryPreferences: ProjectDirectoryPreferences = {
  view: "grouped", sort: "desktop", fullPaths: false, collapsed: {}, recent: {},
};
const storageKey = "bycoda.mobile.project-directory.v1";
export function normalizeProjectDirectoryPreferences(value: unknown): ProjectDirectoryPreferences {
  const data = value && typeof value === "object" ? value as Partial<ProjectDirectoryPreferences> : {};
  return {
    view: data.view === "list" ? "list" : "grouped",
    sort: data.sort === "name" || data.sort === "recent" ? data.sort : "desktop",
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
  return create<{
    machines: Record<string, ProjectDirectoryPreferences>;
    hydrated: boolean;
    error: boolean;
    hydrate(): Promise<void>;
    update(machineId: string, patch: Partial<ProjectDirectoryPreferences>): Promise<void>;
  }>((set, get) => ({
    machines: {}, hydrated: false, error: false,
    hydrate() {
      if (get().hydrated) return Promise.resolve();
      if (loading) return loading;
      loading = storage.getItem(storageKey).then((raw) => {
        let data: unknown;
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
        set({ machines: Object.fromEntries(Object.entries(data && typeof data === "object" ? data : {})
          .map(([id, value]) => [id, normalizeProjectDirectoryPreferences(value)])), error: false });
      }).catch(() => { set({ error: true }); }).finally(() => { set({ hydrated: true }); });
      return loading;
    },
    async update(machineId, patch) {
      await get().hydrate();
      const current = get().machines[machineId] ?? defaultProjectDirectoryPreferences;
      const next = normalizeProjectDirectoryPreferences({ ...current, ...patch });
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
  const preferences = projectDirectoryPreferences((state) => machineId ? state.machines[machineId] ?? defaultProjectDirectoryPreferences : defaultProjectDirectoryPreferences);
  const hydrated = projectDirectoryPreferences((state) => state.hydrated);
  const error = projectDirectoryPreferences((state) => state.error);
  useEffect(() => { void projectDirectoryPreferences.getState().hydrate(); }, []);
  return { preferences, hydrated, error };
}
export async function rememberOpenedProject(machineId: string, projectId: string) {
  await projectDirectoryPreferences.getState().hydrate();
  const previous = projectDirectoryPreferences.getState().machines[machineId] ?? defaultProjectDirectoryPreferences;
  await projectDirectoryPreferences.getState().update(machineId, { recent: { ...previous.recent, [projectId]: Date.now() } });
}
