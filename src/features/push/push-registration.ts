import Constants from "expo-constants";
import type { DevicePushToken } from "expo-notifications";
import { withTimeout } from "../../../../src/shared/lib/withTimeout";
import { notifications } from "../permissions/device-permissions";
import type { PushPreferenceKind, PushPreferences } from "./push-model";
import { PushTokenError } from "./push-token-error";

type Copy = (tr: string, en: string) => string;
const PUSH_TOKEN_TIMEOUT_MS = 15_000;

/** The EAS project that Expo push tokens belong to; absent until the app is linked with `eas init`. */
export function expoProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const id = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === "string" && id ? id : undefined;
}

/** This installation's token for the last project asked about; only a rotation or `fresh` replaces it. */
let cachedToken: { projectId: string; token: string } | undefined;
let pendingToken: { projectId: string; request: Promise<string> } | undefined;
let devicePushToken: DevicePushToken | undefined;
/** Bumped on every rotation so a fetch that started before it never fills the cache with the old token. */
let rotations = 0;
let rotationWatch: Promise<void> | undefined;
const rotationListeners = new Set<() => void>();

/** Runs `listener` after the OS rotates this phone's push token; returns the unsubscribe. */
export function onPushTokenRotated(listener: () => void): () => void {
  rotationListeners.add(listener);
  return () => { rotationListeners.delete(listener); };
}

function watchRotation(): Promise<void> {
  rotationWatch ??= withTimeout(notifications(), PUSH_TOKEN_TIMEOUT_MS, "Notification setup").then((api) => {
    api.addPushTokenListener((token) => {
      // Android emits the token even when a native lookup returns the same value.
      const previous = devicePushToken;
      if (previous?.type === token.type && previous.data === token.data) return;
      devicePushToken = token;
      if (!previous) return;
      rotations += 1;
      cachedToken = undefined;
      pendingToken = undefined;
      for (const listener of [...rotationListeners]) listener();
    });
  }, (error: unknown) => {
    // Without the native module there is no token either; a later call retries the watch.
    rotationWatch = undefined;
    throw error;
  });
  return rotationWatch;
}

/**
 * The Expo push token. Fetching it contacts Expo, so a resume or a second
 * caller reuses the one already held; it is fetched again only after the OS
 * rotates it or when `fresh` asks. A failed fetch is never cached, so the next
 * call retries.
 */
export async function expoPushToken(projectId: string, options?: { fresh?: boolean }): Promise<string> {
  // Registered before the first fetch, so a rotation always clears the cache before any caller's own listener runs.
  await watchRotation();
  if (!options?.fresh) {
    if (cachedToken?.projectId === projectId) return cachedToken.token;
    if (pendingToken?.projectId === projectId) return pendingToken.request;
  }
  const generation = rotations;
  const request = withTimeout(
    notifications().then(async (api) => {
      try {
        if (!devicePushToken) {
          const observedToken = await api.getDevicePushTokenAsync();
          devicePushToken ??= observedToken;
        }
        return (await api.getExpoPushTokenAsync({ projectId, devicePushToken })).data;
      } catch (error) {
        // Raw native text ("Default FirebaseApp is not initialized", "no valid aps-environment…") is not owner copy.
        throw new PushTokenError(error);
      }
    }),
    PUSH_TOKEN_TIMEOUT_MS,
    "Notification token",
  )
    .then((token) => {
      if (generation === rotations) cachedToken = { projectId, token };
      return token;
    })
    .finally(() => {
      if (pendingToken?.request === request) pendingToken = undefined;
    });
  pendingToken = { projectId, request };
  return request;
}

/**
 * The registration a computer stores. Messages carry only this phone's own
 * wording and the computer name it chose: no project or conversation names
 * pass through Expo, Apple or Google.
 */
export function pushRegistration(
  pushToken: string,
  machineName: string,
  preferences: PushPreferences,
  copy: Copy,
) {
  const texts: Record<PushPreferenceKind, string> = {
    finished: copy("Ajan işini bitirdi", "Agent finished"),
    input: copy("Onayın veya cevabın bekleniyor", "Waiting for your approval or answer"),
    failed: copy("Bir tur başarısız oldu", "A turn failed"),
    assistant: copy("Asistanından bir güncelleme var", "Your assistant has an update"),
    approvals: copy("Asistanın onayını bekliyor", "Your assistant needs your approval"),
  };
  return {
    pushToken,
    widgetUpdates: true,
    platform: process.env.EXPO_OS === "ios" ? "ios" : "android",
    title: [...`bycoda · ${machineName}`].slice(0, 120).join(""),
    texts,
    events: preferences.events,
    assistantUrgentDuringQuiet: preferences.assistantUrgentDuringQuiet,
  };
}
