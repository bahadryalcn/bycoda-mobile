import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create, useStore } from "zustand";
import { REMOTE_PROVIDERS } from "../../../../src/features/connections/model/protocol";
import { entryFor, type PickerAccount, type PickerEntry, type PickerProvider } from "./model-picker-model";
import { choiceKey } from "./provider-choices";
import type { RemoteProvider } from "./wire";

/**
 * Phone-local, per computer: the agent, account and model of the last sessions started or changed
 * on this phone, newest first. The model picker offers them as one-tap rows.
 */
export type RecentModel = { provider: RemoteProvider; accountId?: string; model: string };

export const MAX_RECENT_MODELS = 5;
const storageKey = "bycoda.mobile.recent-models.v1";
const maxLength = 200;

function normalize(value: unknown): RecentModel | undefined {
  const data = value && typeof value === "object" ? (value as Partial<RecentModel>) : {};
  const { provider, accountId, model } = data;
  if (!provider || !REMOTE_PROVIDERS.includes(provider)) return;
  if (typeof model !== "string" || !model.trim() || model.length > maxLength) return;
  return {
    provider,
    model,
    // The Host's default login is stored like the picker names it: without an account id.
    ...(typeof accountId === "string" && accountId && accountId !== "default" && accountId.length <= maxLength
      ? { accountId }
      : {}),
  };
}

const identity = (entry: RecentModel) => `${choiceKey(entry.provider, entry.accountId)}|${entry.model}`;

/** The list with `entry` first: distinct provider, account and model, at most five. */
export function addRecentModel(list: readonly RecentModel[], entry: RecentModel): RecentModel[] {
  const next = normalize(entry);
  if (!next) return [...list];
  const key = identity(next);
  return [next, ...list.filter((item) => identity(item) !== key)].slice(0, MAX_RECENT_MODELS);
}

/** Stored lists, each entry validated; a malformed store reads as empty. */
export function readRecentModels(raw: string | null): Record<string, RecentModel[]> {
  let data: unknown;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  return Object.fromEntries(
    Object.entries(data && typeof data === "object" ? data : {}).flatMap(([id, value]) => {
      if (!Array.isArray(value)) return [];
      const list = value.reduceRight<RecentModel[]>((items, item) => {
        const entry = normalize(item);
        return entry ? addRecentModel(items, entry) : items;
      }, []);
      return list.length ? [[id, list] as const] : [];
    }),
  );
}

export function createRecentModelStore(storage: Pick<typeof AsyncStorage, "getItem" | "setItem">) {
  let loading: Promise<void> | undefined;
  // A store that could not be read is not overwritten: it may hold other computers' lists.
  let unread = false;
  let writes = Promise.resolve();
  return create<{
    machines: Record<string, RecentModel[]>;
    hydrate(): Promise<void>;
    record(machineId: string, ...entries: RecentModel[]): Promise<void>;
  }>((set, get) => ({
    machines: {},
    hydrate() {
      loading ??= storage
        .getItem(storageKey)
        .then((raw) => {
          const saved = readRecentModels(raw);
          // Entries recorded while loading stay newest.
          set((state) => {
            const machines = { ...saved };
            for (const [id, list] of Object.entries(state.machines))
              machines[id] = [...list].reverse().reduce(addRecentModel, saved[id] ?? []);
            return { machines };
          });
        })
        .catch(() => { unread = true; });
      return loading;
    },
    async record(machineId, ...entries) {
      await get().hydrate();
      // The first entry given ends up first.
      const list = entries.reduceRight(addRecentModel, get().machines[machineId] ?? []);
      const machines = { ...get().machines, [machineId]: list };
      set({ machines });
      if (unread) return;
      const snapshot = JSON.stringify(machines);
      writes = writes.catch(() => {}).then(() => storage.setItem(storageKey, snapshot));
      await writes.catch(() => {});
    },
  }));
}

export const recentModels = createRecentModelStore(AsyncStorage);

const none: readonly RecentModel[] = [];

export function useRecentModels(machineId: string | undefined): readonly RecentModel[] {
  const list = useStore(recentModels, (state) => (machineId ? state.machines[machineId] : undefined));
  // Load the stored lists once; the store ignores repeated loads.
  useEffect(() => { void recentModels.getState().hydrate(); }, []);
  return list ?? none;
}

/** One recent model as a picker row: the row it opens and the account it belongs to. */
export type RecentPick = {
  key: string;
  entry: PickerEntry;
  account: PickerAccount;
  /** The recorded model; of a family with effort variants, the variant last used. */
  model: string;
  label: string;
  detail: string;
};

/**
 * Recent models the picker still offers, newest first, without the current selection. A model
 * with effort variants shows as its family row and opens the variant last used.
 */
export function recentPicks(recents: readonly RecentModel[], providers: readonly PickerProvider[], limit = 3): RecentPick[] {
  const picks: RecentPick[] = [];
  for (const recent of recents) {
    if (picks.length >= limit) break;
    const key = choiceKey(recent.provider, recent.accountId);
    const provider = providers.find((item) => item.provider === recent.provider);
    const account = provider?.accounts.find((item) => item.key === key);
    const entry = entryFor(account, recent.model);
    if (!provider || !account || !entry || entry.selected) continue;
    const id = `${account.key}|${entry.key}`;
    if (picks.some((pick) => pick.key === id)) continue;
    picks.push({
      key: id,
      entry,
      account,
      model: recent.model,
      label: entry.variants ? entry.label : entry.item.name,
      detail: provider.accounts.length > 1 ? `${provider.title} · ${account.label}` : provider.title,
    });
  }
  return picks;
}
