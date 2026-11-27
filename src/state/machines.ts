import { isLanguagePreference } from "../../../src/shared/i18n/languages";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import type { HostDescriptor, MobileMachine, MobileRoute } from "../remote/types";
import {
  mergeRoutes,
  restoreMachines,
  activeRoute,
  learnRoutes,
  sameRoute,
  validateMachine,
  type MobileLanguage,
} from "./machine-model";
import { decodeProofSeed, encodeProofSeed } from "../remote/device-proof";
import { assertAppAccess } from "./security";
import { PreferenceStorageError } from "./preference-store";
export { isMachinePending } from "./reviewed-machine";

/**
 * Stable English keys for the only failures that block saved connections: the saved list could not be
 * read, or a failed save could not be rolled back. Screens translate them with `storageErrorText`.
 */
export const SAVED_COMPUTERS_LOAD_FAILED =
  "Saved computers could not be loaded. Retry before changing connections.";
export const SAVED_COMPUTERS_RECOVERY_FAILED =
  "Connection recovery failed. Reload connections and pair this computer again.";
/** Quiet automatic retries of a failed preference write; the notice keeps a manual retry after them. */
const PREFERENCE_RETRY_MS = [5_000, 30_000, 120_000] as const;

const key = "bycoda.mobile.remote-machines.v1";
const validId = (id: string) => /^[a-zA-Z0-9-]{1,80}$/.test(id);
const secretKey = (id: string) => {
  if (!validId(id)) throw new Error("Invalid computer identifier.");
  return `bycoda.remote.${id}`;
};
const validToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);
const webCredentials = new Map<string, string>();
const webProofSeeds = new Map<string, string>();
/** Same SecureStore service and policy as the credential; the native socket module reads this key too. */
const proofSeedKey = (id: string) => `bycoda.remote.proof.${secretKey(id).slice("bycoda.remote.".length)}`;
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
const readProofSeed = (id: string): Promise<string | null> =>
  process.env.EXPO_OS === "web"
    ? Promise.resolve(webProofSeeds.get(id) ?? null)
    : SecureStore.getItemAsync(proofSeedKey(id));
async function writeProofSeed(id: string, value: string) {
  if (!decodeProofSeed(value)) throw new Error("Invalid device proof key.");
  if (process.env.EXPO_OS === "web") webProofSeeds.set(id, value);
  else
    await SecureStore.setItemAsync(proofSeedKey(id), value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
}
async function deleteProofSeed(id: string) {
  if (process.env.EXPO_OS === "web") webProofSeeds.delete(id);
  else await SecureStore.deleteItemAsync(proofSeedKey(id));
}
/** Puts the previous seed (or its absence) back after a failed save. */
async function restoreProofSeed(id: string, previous: string | null) {
  if (previous) await writeProofSeed(id, previous);
  else await deleteProofSeed(id);
}
export const credentials = {
  /**
   * The Ed25519 seed bound to this computer's credential, under the same identity guard as the
   * credential itself; null when the credential is not key-bound yet.
   */
  async getProofSeed(
    id: string,
    expected?: Pick<MobileMachine, "endpoint" | "environmentId" | "lanKey">,
  ): Promise<Uint8Array | null> {
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
      value = await readProofSeed(id);
    } catch {
      throw new Error("The saved computer credential could not be read.");
    }
    assertAppAccess();
    return changingCredentials.has(id) ? null : decodeProofSeed(value);
  },
  /** Persists the seed of an already saved computer after `devices.bindProofKey` was attempted. */
  async saveProofSeed(id: string, seed: Uint8Array) {
    try {
      await writeProofSeed(id, encodeProofSeed(seed));
    } catch {
      throw new Error("The computer credential could not be saved securely.");
    }
  },
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
  /** The saved computer list cannot be trusted (unreadable, or a failed save could not be rolled back). Blocks connections. */
  storageError: string | null;
  /**
   * A choice (computer, project, language, learned capabilities) is applied in memory but could not be
   * written to the phone. Never blocks connections; retried quietly and by `retryPreferences`.
   */
  preferenceError: PreferenceStorageError | null;
  /** Any connection change is running; screens that edit connections gate on this. */
  connectionPending: boolean;
  /** Computers whose own connection (credential, route or removal) is changing right now. */
  pendingMachineIds: readonly string[];
  /** In-memory revisions of committed credential replacements, without storing credentials in state. */
  credentialRevisions: ReadonlyMap<string, number>;
  /** A change that is not tied to one computer is running; it affects every computer. */
  accountPending: boolean;
  hydrate(): Promise<void>;
  /** `proofSeed` is the key the credential was bound to at pairing; a replaced credential without one drops the old seed. */
  /**
   * `activate: false` (editing a saved computer) keeps the current selection; a saved computer always
   * keeps its place in the list.
   */
  saveMachine(
    machine: MobileMachine,
    token: string,
    proofSeed?: Uint8Array,
    options?: { activate?: boolean },
  ): Promise<void>;
  /** Makes another saved route of the same computer the active one. */
  switchRoute(id: string, route: MobileRoute): Promise<boolean>;
  removeMachine(id: string, expected?: Pick<MobileMachine, "endpoint" | "environmentId" | "lanKey">): Promise<void>;
  selectMachine(id: string): void;
  refreshDescriptor(id: string, descriptor: HostDescriptor): void;
  selectProject(id: string | null): void;
  setLanguage(value: MobileLanguage): void;
  /** Writes the current choices again after a failed preference save. */
  retryPreferences(): Promise<void>;
};
let persistence = Promise.resolve();
let hydration: Promise<void> | null = null;
let mutations = Promise.resolve();
let pendingMutations = 0;
let pendingAccountMutations = 0;
function publishPending() {
  useMachines.setState({
    connectionPending: pendingMutations > 0,
    accountPending: pendingAccountMutations > 0,
    pendingMachineIds: [...changingCredentials.keys()],
  });
}
function serializeMutation<T>(id: string | null, operation: () => Promise<T>): Promise<T> {
  if (id !== null) changingCredentials.set(id, (changingCredentials.get(id) ?? 0) + 1);
  else pendingAccountMutations++;
  pendingMutations++;
  publishPending();
  const task = mutations
    .catch(() => undefined)
    .then(operation)
    .finally(() => {
      if (id !== null) {
        const remaining = (changingCredentials.get(id) ?? 1) - 1;
        if (remaining) changingCredentials.set(id, remaining);
        else changingCredentials.delete(id);
      } else pendingAccountMutations--;
      pendingMutations--;
      publishPending();
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
  ).then(() => {
    // Every write stores the whole record, so any success also saved earlier unsaved choices.
    clearPreferenceRetry();
    if (useMachines.getState().preferenceError) useMachines.setState({ preferenceError: null });
  });
}
let preferenceRetry: ReturnType<typeof setTimeout> | undefined;
let preferenceRetries = 0;
function clearPreferenceRetry() {
  if (preferenceRetry !== undefined) clearTimeout(preferenceRetry);
  preferenceRetry = undefined;
  preferenceRetries = 0;
}
/**
 * A choice that could not be written stays applied in memory; connections keep running. The failure is
 * reported as a non-blocking preference error and retried quietly a few times.
 */
function persistPreference(): Promise<void> {
  return persist().catch(() => {
    if (!useMachines.getState().hydrated || useMachines.getState().storageError) return;
    // Keep the reported error while quiet retries fail, so the warning is raised once.
    if (!useMachines.getState().preferenceError)
      useMachines.setState({ preferenceError: new PreferenceStorageError("save") });
    if (preferenceRetry !== undefined) return;
    const delay = PREFERENCE_RETRY_MS[preferenceRetries];
    if (delay === undefined) return;
    preferenceRetries++;
    preferenceRetry = setTimeout(() => {
      preferenceRetry = undefined;
      const state = useMachines.getState();
      if (state.preferenceError && state.hydrated && !state.storageError) void persistPreference();
    }, delay);
    preferenceRetry.unref?.();
  });
}
/** Settles once the connection changes queued so far have finished. */
export function whenConnectionsSettled(): Promise<void> {
  return mutations;
}
function requireStorage() {
  const state = useMachines.getState();
  if (!state.hydrated || state.storageError)
    throw new Error("Connection storage is unavailable. Retry loading first.");
}
/** Pairing cannot add a computer while disconnected local data is being removed. */
export function withDisconnectedComputers<T>(operation: () => Promise<T>): Promise<T> {
  return serializeMutation(null, async () => {
    requireStorage(); assertAppAccess();
    if (useMachines.getState().machines.length) throw new Error("Disconnect computers before deleting saved drafts.");
    return operation();
  });
}
export const useMachines = create<MachineState>((set, get) => ({
  machines: [],
  activeId: null,
  selectedProjectId: null,
  projects: {},
  language: "system",
  hydrated: false,
  storageError: null,
  preferenceError: null,
  connectionPending: false,
  pendingMachineIds: [],
  credentialRevisions: new Map(),
  accountPending: false,
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
          preferenceError: null,
        });
        clearPreferenceRetry();
      } catch {
        set({
          hydrated: true,
          storageError: SAVED_COMPUTERS_LOAD_FAILED,
        });
      }
    })().finally(() => {
      hydration = null;
    });
    return hydration;
  },
  async saveMachine(input, token, proofSeed, options) {
    const validated = validateMachine(input);
    if (!validToken(token)) throw new Error("Enter a valid 43-character device credential.");
    return serializeMutation(validated.id, async () => {
      requireStorage();
      const prior = get();
      const existing = prior.machines.find((value) => value.id === validated.id);
      if (existing && existing.environmentId !== validated.environmentId)
        throw new Error(
          "This connection belongs to another computer. Add the new computer separately.",
        );
      // Pairing the same computer by another method adds a route instead of
      // replacing the old one: one device credential is valid on every route.
      const machine = existing
        ? validateMachine({
            ...validated,
            routes: mergeRoutes(
              activeRoute(validated),
              validated.routes,
              existing.routes ?? [activeRoute(existing)],
            ),
          })
        : validated;
      let oldToken: string | null;
      let oldSeed: string | null = null;
      let seedRead = false;
      try {
        oldToken = await readSecret(machine.id);
        oldSeed = await readProofSeed(machine.id);
        seedRead = true;
        // The credential and its key change together; a failure restores the previous pair.
        if (proofSeed) await writeProofSeed(machine.id, encodeProofSeed(proofSeed));
        else if (oldToken !== token && oldSeed) await deleteProofSeed(machine.id);
        await writeSecret(machine.id, token);
      } catch {
        if (seedRead) await restoreProofSeed(machine.id, oldSeed).catch(() => {});
        throw new Error("The computer credential could not be saved securely.");
      }
      set((s) => {
        const activate = options?.activate !== false || !s.activeId;
        const activeId = activate ? machine.id : s.activeId;
        return {
          machines: s.machines.some((m) => m.id === machine.id)
            ? s.machines.map((m) => (m.id === machine.id ? machine : m))
            : [...s.machines, machine],
          activeId,
          selectedProjectId: activate ? (s.projects[machine.id] ?? null) : s.selectedProjectId,
        };
      });
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
          await restoreProofSeed(machine.id, oldSeed);
        } catch {
          set({ storageError: SAVED_COMPUTERS_RECOVERY_FAILED });
        }
        throw new Error("Computer could not be saved. Check available device storage.");
      }
      if (oldToken !== token) set((state) => {
        const credentialRevisions = new Map(state.credentialRevisions);
        credentialRevisions.set(machine.id, (credentialRevisions.get(machine.id) ?? 0) + 1);
        return { credentialRevisions };
      });
    });
  },
  async removeMachine(id, expected) {
    if (!validId(id)) throw new Error("Invalid computer identifier.");
    const expectedIdentity = expected ? { endpoint: expected.endpoint, environmentId: expected.environmentId, lanKey: expected.lanKey } : undefined;
    return serializeMutation(id, async () => {
      requireStorage();
      const prior = get();
      const origin = prior.machines.find((machine) => machine.id === id);
      if (!origin) return;
      if (expectedIdentity && (origin.endpoint !== expectedIdentity.endpoint || origin.environmentId !== expectedIdentity.environmentId || origin.lanKey !== expectedIdentity.lanKey))
        throw new Error("This computer connection changed. Reopen its current route.");
      let oldToken: string | null = null;
      let oldSeed: string | null = null;
      let seedRead = false;
      try {
        oldToken = await readSecret(id);
        oldSeed = await readProofSeed(id);
        seedRead = true;
        await deleteSecret(id);
        if (oldSeed) await deleteProofSeed(id);
      } catch {
        // A half-removed credential must not lose its key: put back what was deleted.
        if (oldToken) await writeSecret(id, oldToken).catch(() => {});
        if (seedRead) await restoreProofSeed(id, oldSeed).catch(() => {});
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
          await restoreProofSeed(id, oldSeed);
        } catch {
          set({ storageError: SAVED_COMPUTERS_RECOVERY_FAILED });
        }
        throw new Error("Computer could not be removed from device storage.");
      }
      set((state) => {
        const credentialRevisions = new Map(state.credentialRevisions);
        credentialRevisions.delete(id);
        return { credentialRevisions };
      });
    });
  },
  switchRoute(id, route) {
    return serializeMutation(id, async () => {
      if (!get().hydrated || get().storageError) return false;
      const prior = get();
      const current = prior.machines.find((machine) => machine.id === id);
      const target = current?.routes?.find((known) => sameRoute(known, route));
      if (!current || !target || sameRoute(current, target)) return false;
      const next = validateMachine({
        ...current,
        endpoint: target.endpoint,
        lanKey: target.lanKey,
        public: target.public,
      });
      set((s) => ({ machines: s.machines.map((m) => (m.id === id ? next : m)) }));
      try {
        await persist();
      } catch {
        set({ machines: prior.machines });
        return false;
      }
      return true;
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
    void persistPreference();
  },
  refreshDescriptor(id, descriptor) {
    if (!get().hydrated || get().storageError || pendingMutations) return;
    const current = get().machines.find((m) => m.id === id);
    if (!current || current.environmentId !== descriptor.environmentId) return;
    const learned = learnRoutes(current, descriptor.mobileRoutes);

    const routes = learned === undefined ? current.routes : learned.length > 1 ? learned : undefined;
    if (
      JSON.stringify([current.providers, current.capabilities, current.platform, current.routes]) ===
      JSON.stringify([descriptor.providers, descriptor.capabilities, descriptor.platform, routes])
    )
      return;
    set((s) => ({
      machines: s.machines.map((m) => {
        if (m.id !== id) return m;
        const { routes: _previous, ...rest } = m;
        return validateMachine({
          ...rest,
          providers: descriptor.providers,
          capabilities: descriptor.capabilities,
          platform: descriptor.platform,
          ...(routes ? { routes } : {}),
        });
      }),
    }));
    void persistPreference();
  },
  selectProject(id) {
    if (!get().hydrated || get().storageError) return;
    if (pendingMutations) {
      // A connection change is running: apply the choice once it settles, if it still targets the same computer.
      const target = get().activeId;
      void mutations.then(() => {
        if (get().activeId === target) get().selectProject(id);
      });
      return;
    }
    const activeId = get().activeId;
    if (!activeId) return;
    const projects = { ...get().projects };
    if (id) projects[activeId] = id;
    else delete projects[activeId];
    set({ projects, selectedProjectId: id });
    void persistPreference();
  },
  setLanguage(language) {
    if (!isLanguagePreference(language) || !get().hydrated || get().storageError) return;
    if (pendingMutations) {
      void mutations.then(() => get().setLanguage(language));
      return;
    }
    set({ language });
    void persistPreference();
  },
  async retryPreferences() {
    const state = get();
    if (!state.preferenceError || !state.hydrated || state.storageError) return;
    clearPreferenceRetry();
    await persist().catch(() => {
      set({ preferenceError: new PreferenceStorageError("save") });
      throw new PreferenceStorageError("save");
    });
  },
}));
export function useActiveMachine() {
  return useMachines((s) => s.machines.find((m) => m.id === s.activeId) ?? null);
}
