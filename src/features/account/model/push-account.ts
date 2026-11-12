import { useEffect } from "react";
import type { Device } from "../contracts";
import { allowDevicePermission, notifications, readDevicePermission } from "../../permissions/device-permissions";
import { expoProjectId, expoPushToken } from "../../push/push-registration";
import type { AccountRuntime } from "./account-runtime";
import { securePushMarkStore } from "./device-store";
import { syncPushToken, type PushSyncResult } from "./push-sync";

let blockerLogged = false;

/** Expo push needs the EAS project id (`extra.eas.projectId`); without it the feature stays hidden. */
export function accountPushAvailable(): boolean {
  if (process.env.EXPO_OS === "web") return false;
  if (expoProjectId()) return true;
  if (!blockerLogged) {
    blockerLogged = true;
    console.warn("[account] Push registration is off: app config extra.eas.projectId is missing (owner step: eas init).");
  }
  return false;
}

/** Fetches the Expo token and sends it to the account service when it changed. Never prompts. */
export async function syncAccountPush(runtime: AccountRuntime, device: Device): Promise<PushSyncResult> {
  const projectId = expoProjectId();
  if (!projectId) throw new Error("EAS project id is missing.");
  return syncPushToken({
    client: runtime.client,
    deviceId: device.id,
    token: await expoPushToken(projectId),
    marks: securePushMarkStore,
  });
}

/** The explicit user action: ask the OS, then register. Returns whether notifications are on. */
export async function enableAccountPush(runtime: AccountRuntime, device: Device): Promise<boolean> {
  const permission = await allowDevicePermission("notifications");
  if (!permission.granted) return false;
  await syncAccountPush(runtime, device);
  return true;
}

/**
 * Keeps the service's token current once the person has allowed notifications: syncs on sign-in and
 * whenever the OS rotates the push token. It only reads the permission; it never asks for it.
 */
export function useAccountPushSync(runtime: AccountRuntime | null, device: Device | null) {
  useEffect(() => {
    if (!runtime || !device || !accountPushAvailable()) return;
    let cancelled = false;
    let subscription: { remove(): void } | undefined;
    const sync = () =>
      syncAccountPush(runtime, device).catch((error: unknown) => {
        console.warn("[account] Push token sync failed.", error instanceof Error ? error.message : error);
      });
    void (async () => {
      const permission = await readDevicePermission("notifications").catch(() => null);
      if (cancelled || !permission?.granted) return;
      await sync();
      const api = await notifications();
      if (cancelled) return;
      subscription = api.addPushTokenListener(() => void sync());
    })();
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [runtime, device]);
}
