import { isLanguagePreference } from "../../../src/shared/i18n/languages";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import type { HostDescriptor, MobileMachine } from "../remote/types";
import { restoreMachines, validateMachine, type MobileLanguage } from "./machine-model";
import { assertAppAccess } from "./security";

const key = "bycoda.mobile.remote-machines.v1";
const validId = (id: string) => /^[a-zA-Z0-9-]{1,80}$/.test(id);
const secretKey = (id: string) => {
  if (!validId(id)) throw new Error("Invalid computer identifier.");
  return `bycoda.remote.${id}`;
};
const validToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);
const webCredentials = new Map<string, string>();
const changingCredentials = new Map<string, number>();
const readSecret = (id: string): Promise<string | null> =>
  process.env.EXPO_OS === "web"
    ? Promise.resolve(webCredentials.get(id) ?? null)
    : SecureStore.getItemAsync(secretKey(id));
async function writeSecret(id: string, value: string) {
  secretKey(id);
  if (!validToken(value)) throw new Error("Enter a valid 43-character device credential.");
  if (process.env.EXPO_OS === "web") webCredentials.set(id, value);
  else
    await SecureStore.setItemAsync(secretKey(id), value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
}
async function deleteSecret(id: string) {
  secretKey(id);
  if (process.env.EXPO_OS === "web") webCredentials.delete(id);
  else await SecureStore.deleteItemAsync(secretKey(id));
}
export const credentials = {
  async get(
    id: string,
    expected?: Pick<MobileMachine, "endpoint" | "environmentId" | "lanKey">,
  ): Promise<string | null> {
    assertAppAccess();
    if (!validId(id) || changingCredentials.has(id)) return null;
    const state = useMachines.getState();
    if (!state.hydrated || state.storageError)
      throw new Error("Saved computer connections are unavailable.");
    const current = state.machines.find((machine) => machine.id === id);
    if (
      !current ||
      (expected &&
        (current.endpoint !== expected.endpoint ||
          current.environmentId !== expected.environmentId ||
          current.lanKey !== expected.lanKey))
    )
      return null;
    let value: string | null;
    try {
      value = await readSecret(id);
    } catch {
      throw new Error("The saved computer credential could not be read.");
    }
    assertAppAccess();
    const latestState = useMachines.getState();
    if (!latestState.hydrated || latestState.storageError)
      throw new Error("Saved computer connections are unavailable.");
    const latest = latestState.machines.find((machine) => machine.id === id);
    if (
      changingCredentials.has(id) ||
      !latest ||
      latest.endpoint !== current.endpoint ||
      latest.environmentId !== current.environmentId ||
      latest.lanKey !== current.lanKey
    )
      return null;
    return value && validToken(value) ? value : null;
  },
  async save(id: string, value: string) {
    try {
      await writeSecret(id, value);
    } catch {
      throw new Error("The computer credential could not be saved securely.");
    }
  },
  async remove(id: string) {
    try {
      await deleteSecret(id);
    } catch {
      throw new Error("The computer credential could not be removed securely.");
    }
  },
};

type MachineState = {
  machines: MobileMachine[];
  activeId: string | null;
  selectedProjectId: string | null;
  projects: Record<string, string>;
  language: MobileLanguage;
  hydrated: boolean;
  storageError: string | null;
  connectionPending: boolean;
  hydrate(): Promise<void>;
  saveMachine(machine: MobileMachine, token: string): Promise<void>;
  removeMachine(id: string): Promise<void>;
  selectMachine(id: string): void;
  refreshDescriptor(id: string, descriptor: HostDescriptor): void;
  selectProject(id: string | null): void;
  setLanguage(value: MobileLanguage): void;
};
let persistence = Promise.resolve();
let hydration: Promise<void> | null = null;
let mutations = Promise.resolve();
let pendingMutations = 0;
function serializeMutation<T>(id: string, operation: () => Promise<T>): Promise<T> {
  changingCredentials.set(id, (changingCredentials.get(id) ?? 0) + 1);
  pendingMutations++;
  useMachines.setState({ connectionPending: true });
  const task = mutations
    .catch(() => undefined)
    .then(operation)
    .finally(() => {
      const remaining = (changingCredentials.get(id) ?? 1) - 1;
      if (remaining) changingCredentials.set(id, remaining);
      else changingCredentials.delete(id);
      pendingMutations--;
      useMachines.setState({ connectionPending: pendingMutations > 0 });
    });
  mutations = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}
function persistData(data: string) {
  persistence = persistence.catch(() => undefined).then(() => AsyncStorage.setItem(key, data));
  return persistence;
}
function persist() {
  const { machines, activeId, projects, language } = useMachines.getState();
  // Always project metadata through the whitelist, even if an imported caller adds fields.
  return persistData(
    JSON.stringify({ machines: restoreMachines(machines), activeId, projects, language }),
  );
}
function requireStorage() {
  const state = useMachines.getState();
  if (!state.hydrated || state.storageError)
    throw new Error("Connection storage is unavailable. Retry loading first.");
}
export const useMachines = create<MachineState>((set, get) => ({
  machines: [],
  activeId: null,
  selectedProjectId: null,
  projects: {},
  language: "system",
  hydrated: false,
  storageError: null,
  connectionPending: false,
  async hydrate() {
    if (pendingMutations) {
      await mutations;
      return get().hydrate();
    }
    if (hydration) return hydration;
    set({ hydrated: false });
    hydration = (async () => {
      try {
        await persistence.catch(() => undefined);
        const raw = await AsyncStorage.getItem(key);
        const data = raw === null ? { machines: [] } : JSON.parse(raw);
        if (
          !data ||
          typeof data !== "object" ||
          Array.isArray(data) ||
          !Array.isArray(data.machines)
        )
          throw new Error("Invalid connection storage.");
        const machines = restoreMachines(data.machines);
        if (machines.length !== data.machines.length) throw new Error("Invalid saved computer.");
        const activeId = machines.some((m) => m.id === data.activeId)
          ? data.activeId
          : (machines[0]?.id ?? null);
        const projects: Record<string, string> = {};
        for (const m of machines)
          if (typeof data.projects?.[m.id] === "string") projects[m.id] = data.projects[m.id];
        const language = isLanguagePreference(data.language) ? data.language : "system";
        const sanitized = JSON.stringify({ machines, activeId, projects, language });
        // Remove imported/legacy secret fields on disk before allowing credential access.
        if (raw !== null && raw !== sanitized) await persistData(sanitized);
        set({
          machines,
          activeId,
          projects,
          language,
          selectedProjectId: activeId ? (projects[activeId] ?? null) : null,
          hydrated: true,
          storageError: null,
        });
      } catch {
        set({
          hydrated: true,
          storageError: "Saved computers could not be loaded. Retry before changing connections.",
        });
      }
    })().finally(() => {
      hydration = null;
    });
    return hydration;
  },
  async saveMachine(input, token) {
    const machine = validateMachine(input);
    if (!validToken(token)) throw new Error("Enter a valid 43-character device credential.");
    return serializeMutation(machine.id, async () => {
      requireStorage();
      const prior = get();
      const existing = prior.machines.find((value) => value.id === machine.id);
      if (existing && existing.environmentId !== machine.environmentId)
        throw new Error(
          "This connection belongs to another computer. Add the new computer separately.",
        );
      let oldToken: string | null;
      try {
        oldToken = await readSecret(machine.id);
        await writeSecret(machine.id, token);
      } catch {
        throw new Error("The computer credential could not be saved securely.");
      }
      set((s) => ({
        machines: [...s.machines.filter((m) => m.id !== machine.id), machine],
        activeId: machine.id,
        selectedProjectId: s.projects[machine.id] ?? null,
      }));
      try {
        await persist();
      } catch {
        set({
          machines: prior.machines,
          activeId: prior.activeId,
          selectedProjectId: prior.selectedProjectId,
        });
        try {
          if (oldToken) await writeSecret(machine.id, oldToken);
          else await deleteSecret(machine.id);
        } catch {
          set({
            storageError:
              "Connection recovery failed. Reload connections and pair this computer again.",
          });
        }
        throw new Error("Computer could not be saved. Check available device storage.");
      }
    });
  },
  async removeMachine(id) {
    if (!validId(id)) throw new Error("Invalid computer identifier.");
    return serializeMutation(id, async () => {
      requireStorage();
      const prior = get();
      if (!prior.machines.some((machine) => machine.id === id)) return;
      let oldToken: string | null;
      try {
        oldToken = await readSecret(id);
        await deleteSecret(id);
      } catch {
        throw new Error(
          "The computer credential could not be removed securely. The connection was kept for retry.",
        );
      }
      const machines = prior.machines.filter((m) => m.id !== id);
      const activeId = prior.activeId === id ? (machines[0]?.id ?? null) : prior.activeId;
      const projects = { ...prior.projects };
      delete projects[id];
      set({
        machines,
        activeId,
        projects,
        selectedProjectId: activeId ? (projects[activeId] ?? null) : null,
      });
      try {
        await persist();
      } catch {
        set({
          machines: prior.machines,
          activeId: prior.activeId,
          projects: prior.projects,
          selectedProjectId: prior.selectedProjectId,
        });
        try {
          if (oldToken) await writeSecret(id, oldToken);
        } catch {
          set({
            storageError:
              "Connection recovery failed. Reload connections and pair this computer again.",
          });
        }
        throw new Error("Computer could not be removed from device storage.");
      }
    });
  },
  selectMachine(id) {
    if (
      !get().hydrated ||
      get().storageError ||
      pendingMutations ||
      !get().machines.some((m) => m.id === id)
    )
      return;
    set((s) => ({ activeId: id, selectedProjectId: s.projects[id] ?? null }));
    void persist().catch(() => set({ storageError: "Connection preference could not be saved." }));
  },
  refreshDescriptor(id, descriptor) {
    if (!get().hydrated || get().storageError || pendingMutations) return;
    const current = get().machines.find((m) => m.id === id);
    if (
      !current ||
      current.environmentId !== descriptor.environmentId ||
      JSON.stringify([current.providers, current.capabilities, current.platform]) ===
        JSON.stringify([descriptor.providers, descriptor.capabilities, descriptor.platform])
    )
      return;
    set((s) => ({
      machines: s.machines.map((m) =>
        m.id === id
          ? validateMachine({
              ...m,
              providers: descriptor.providers,
              capabilities: descriptor.capabilities,
              platform: descriptor.platform,
            })
          : m,
      ),
    }));
    void persist().catch(() => set({ storageError: "Computer capabilities could not be saved." }));
  },
  selectProject(id) {
    if (!get().hydrated || get().storageError || pendingMutations) return;
    const activeId = get().activeId;
    if (!activeId) return;
    const projects = { ...get().projects };
    if (id) projects[activeId] = id;
    else delete projects[activeId];
    set({ projects, selectedProjectId: id });
    void persist().catch(() => set({ storageError: "Project preference could not be saved." }));
  },
  setLanguage(language) {
    if (
      !isLanguagePreference(language) ||
      !get().hydrated ||
      get().storageError ||
      pendingMutations
    )
      return;
    set({ language });
    void persist().catch(() => set({ storageError: "Language preference could not be saved." }));
  },
}));
export function useActiveMachine() {
  return useMachines((s) => s.machines.find((m) => m.id === s.activeId) ?? null);
}
