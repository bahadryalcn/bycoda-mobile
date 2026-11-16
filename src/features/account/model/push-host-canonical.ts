import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AccountClient, NotificationEventKey, NotificationSettings } from "../contracts";
import { channelEnabled, setChannel } from "./notification-settings";

/**
 * Agent events the local Host pushes itself. While this phone has an active Host push registration
 * the account channel leaves them to the Host so one event rings once; account events stay.
 */
export const HOST_CANONICAL_EVENTS: readonly NotificationEventKey[] = ["agent.finished", "agent.failed", "approval.pending"];

/** The account push values replaced while the Host is canonical, so they can be put back. */
export interface HostCanonicalStore {
  read(): Promise<Partial<Record<NotificationEventKey, boolean>> | null>;
  write(value: Partial<Record<NotificationEventKey, boolean>> | null): Promise<void>;
}

const KEY = "bycoda.account.hostCanonicalPush.v1";
export const hostCanonicalStore: HostCanonicalStore = {
  read: async () => {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<NotificationEventKey, boolean>>) : null;
  },
  write: async (value) => {
    if (value) await AsyncStorage.setItem(KEY, JSON.stringify(value));
    else await AsyncStorage.removeItem(KEY);
  },
};

/** Returns the settings the account should hold, or null when nothing needs to change. */
export function reconcileHostCanonical(
  settings: NotificationSettings,
  hostActive: boolean,
  saved: Partial<Record<NotificationEventKey, boolean>> | null,
): { settings: NotificationSettings; saved: Partial<Record<NotificationEventKey, boolean>> | null } | null {
  let next = settings;
  if (hostActive) {
    const remembered = { ...(saved ?? {}) };
    for (const event of HOST_CANONICAL_EVENTS) {
      if (!channelEnabled(next, event, "push")) continue;
      if (!(event in remembered)) remembered[event] = true;
      next = setChannel(next, event, "push", false);
    }
    return next === settings ? null : { settings: next, saved: remembered };
  }
  if (!saved) return null;
  for (const event of HOST_CANONICAL_EVENTS) {
    if (saved[event] && !channelEnabled(next, event, "push")) next = setChannel(next, event, "push", true);
  }
  return { settings: next, saved: null };
}

/** Puts the account push preferences in step with whether the Host is canonical for agent events. */
export async function syncHostCanonical(client: AccountClient, hostActive: boolean, store: HostCanonicalStore = hostCanonicalStore): Promise<void> {
  const saved = await store.read().catch(() => null);
  if (!hostActive && !saved) return;
  const result = reconcileHostCanonical(await client.getNotificationSettings(), hostActive, saved);
  if (!result) return;
  await client.putNotificationSettings({ body: result.settings });
  await store.write(result.saved);
}
