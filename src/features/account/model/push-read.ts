import { useEffect } from "react";
import { notifications } from "../../permissions/device-permissions";
import { NOTIFICATION_EVENT_KEYS, type Device, type NotificationItem } from "../contracts";
import type { AccountRuntime } from "./account-runtime";

/** What an account push (not a computer push) asks this phone to do. */
export type AccountPushPayload =
  | { kind: "opened"; dedupeKey: string }
  | { kind: "read-sync"; dedupeKeys: string[]; badge: number | null };

const KEY = /^[A-Za-z0-9._:-]{1,100}$/;

/**
 * Reads the data of an account push: `{ event, dedupeKey }` for a visible one; `{ readSync: true,
 * dedupeKeys? }` (or `kind: "read_sync"`, or `data.type === "notifications.read"` as the server sends it) for the silent
 * push that mirrors a read on another device. `badge` is the unread count when the push carries one.
 */
export function accountPushPayload(data: unknown, badge?: number | null): AccountPushPayload | null {
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  if (value.readSync === true || value.kind === "read_sync" || value.type === "notifications.read") {
    const keys = Array.isArray(value.dedupeKeys) ? value.dedupeKeys : [];
    const count = [value.badge, badge].find((entry): entry is number => typeof entry === "number" && Number.isFinite(entry) && entry >= 0);
    return {
      kind: "read-sync",
      dedupeKeys: keys.filter((key): key is string => typeof key === "string" && KEY.test(key)),
      badge: count === undefined ? null : Math.floor(count),
    };
  }
  if (!(NOTIFICATION_EVENT_KEYS as readonly string[]).includes(String(value.event))) return null;
  if (typeof value.dedupeKey !== "string" || !KEY.test(value.dedupeKey)) return null;
  return { kind: "opened", dedupeKey: value.dedupeKey };
}

/** Unread feed ids that share one of the dedupe keys (one logical event can appear once per key). */
export function unreadIdsFor(items: readonly NotificationItem[], keys: readonly string[]): string[] {
  const wanted = new Set(keys);
  return items.filter((item) => item.readAt === null && wanted.has(item.dedupeKey)).map((item) => item.id);
}

/** Marks the feed entries of an opened push as read. Returns how many were marked. */
export async function markPushRead(client: AccountRuntime["client"], dedupeKey: string): Promise<number> {
  const feed = await client.listNotifications({ query: { limit: 100 } });
  const ids = unreadIdsFor(feed.items, [dedupeKey]);
  if (ids.length) await client.markNotificationsRead({ body: { ids } });
  return ids.length;
}

type Presented = { request: { identifier: string; content: { data?: unknown } } };

/** Identifiers of delivered notifications that a read-sync push covers (all of them without keys). */
export function presentedToDismiss(presented: readonly Presented[], keys: readonly string[]): string[] {
  return presented
    .filter((entry) => {
      if (!keys.length) return accountPushPayload(entry.request.content.data)?.kind === "opened";
      const payload = accountPushPayload(entry.request.content.data);
      return payload?.kind === "opened" && keys.includes(payload.dedupeKey);
    })
    .map((entry) => entry.request.identifier);
}

/**
 * Mirrors a read from another device: sets the badge to the unread count the push carries; on Android
 * also removes tray entries that were read (all of them when the count is 0, since the push has no
 * dedupe keys to match individual ones), and clears the badge when nothing is left without a count.
 */
async function clearRead(api: Awaited<ReturnType<typeof notifications>>, payload: Extract<AccountPushPayload, { kind: "read-sync" }>) {
  if (payload.badge !== null) await api.setBadgeCountAsync(payload.badge);
  if (process.env.EXPO_OS !== "android") return;
  if (payload.badge === 0) {
    await api.dismissAllNotificationsAsync();
    return;
  }
  if (!payload.dedupeKeys.length && payload.badge !== null) return;
  const presented = await api.getPresentedNotificationsAsync();
  const ids = presentedToDismiss(presented, payload.dedupeKeys);
  await Promise.all(ids.map((id) => api.dismissNotificationAsync(id)));
  if (payload.badge === null && ids.length === presented.length) await api.setBadgeCountAsync(0);
}

/**
 * Opening an account push marks it read; a read-sync push clears what another device already read.
 * A silent push that arrives while the app is closed needs a background task (not shipped), so the
 * foreground and tap paths are the ones covered.
 */
export function useAccountPushReads(runtime: AccountRuntime | null, device: Device | null) {
  useEffect(() => {
    if (!runtime || !device || process.env.EXPO_OS === "web") return;
    let disposed = false;
    const subscriptions: { remove(): void }[] = [];
    const warn = (error: unknown) => console.warn("[account] Notification read sync failed.", error instanceof Error ? error.message : error);
    void notifications()
      .then(async (api) => {
        if (disposed) return;
        const opened = (data: unknown) => {
          const payload = accountPushPayload(data);
          if (payload?.kind === "opened") void markPushRead(runtime.client, payload.dedupeKey).catch(warn);
        };
        subscriptions.push(api.addNotificationResponseReceivedListener((response) => opened(response.notification.request.content.data)));
        subscriptions.push(
          api.addNotificationReceivedListener((notification) => {
            const payload = accountPushPayload(notification.request.content.data, notification.request.content.badge);
            if (payload?.kind === "read-sync") void clearRead(api, payload).catch(warn);
          }),
        );
        const initial = await api.getLastNotificationResponseAsync();
        if (!disposed && initial) opened(initial.notification.request.content.data);
      })
      .catch(() => {
        // Without the native module (Expo Go, web) there is nothing to sync.
      });
    return () => {
      disposed = true;
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, [runtime, device]);
}
