import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create, useStore } from "zustand";
import { REMOTE_PROVIDERS } from "../../../../src/features/connections/model/protocol";
import type { CreationDraft } from "./creation-selection";
import type { HostModelCatalog, RemoteProvider } from "./wire";

/** Phone-local, per computer: the agent, account and model of the last session started from New session. */
export type LastCreationChoice = { provider: RemoteProvider; accountId?: string; model: string };

const storageKey = "bycoda.mobile.new-session-choice.v1";
const maxLength = 200;

function normalize(value: unknown): LastCreationChoice | undefined {
  const data = value && typeof value === "object" ? (value as Partial<LastCreationChoice>) : {};
  const { provider, accountId, model } = data;
  if (!provider || !REMOTE_PROVIDERS.includes(provider)) return;
  if (typeof model !== "string" || !model.trim() || model.length > maxLength) return;
  return {
    provider,
    model,
    ...(typeof accountId === "string" && accountId && accountId.length <= maxLength ? { accountId } : {}),
  };
}

export function createLastCreationChoiceStore(storage: Pick<typeof AsyncStorage, "getItem" | "setItem">) {
  let loading: Promise<void> | undefined;
  let writes = Promise.resolve();
  return create<{
    machines: Record<string, LastCreationChoice>;
    hydrate(): Promise<void>;
    remember(machineId: string, choice: LastCreationChoice): Promise<void>;
  }>((set, get) => ({
    machines: {},
    hydrate() {
      loading ??= storage
        .getItem(storageKey)
        .then((raw) => {
          let data: unknown;
          try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
          const saved = Object.entries(data && typeof data === "object" ? data : {}).flatMap(([id, value]) => {
            const choice = normalize(value);
            return choice ? [[id, choice] as const] : [];
          });
          // A choice remembered while loading wins over the stored one.
          set((state) => ({ machines: { ...Object.fromEntries(saved), ...state.machines } }));
        })
        .catch(() => {});
      return loading;
    },
    async remember(machineId, choice) {
      await get().hydrate();
      const machines = { ...get().machines, [machineId]: choice };
      set({ machines });
      const snapshot = JSON.stringify(machines);
      writes = writes.catch(() => {}).then(() => storage.setItem(storageKey, snapshot));
      await writes.catch(() => {});
    },
  }));
}

export const lastCreationChoices = createLastCreationChoiceStore(AsyncStorage);

export function useLastCreationChoice(machineId: string | undefined) {
  const choice = useStore(lastCreationChoices, (state) => (machineId ? state.machines[machineId] : undefined));
  // Load the stored choices once for this screen; the store ignores repeated loads.
  useEffect(() => { void lastCreationChoices.getState().hydrate(); }, []);
  return choice;
}

/** The remembered choice as a draft, only while the connected computer still offers that model. */
export function rememberedDraft(choice: LastCreationChoice | undefined, catalog: HostModelCatalog | undefined): CreationDraft | undefined {
  if (!choice || !catalog?.models[choice.provider]?.some((model) => model.id === choice.model)) return;
  return { provider: choice.provider, accountId: choice.accountId, model: choice.model };
}
