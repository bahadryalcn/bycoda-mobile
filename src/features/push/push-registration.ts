import Constants from "expo-constants";
import { notifications } from "../permissions/device-permissions";
import type { PushPreferenceKind, PushPreferences } from "./push-model";

type Copy = (tr: string, en: string) => string;

/** The EAS project that Expo push tokens belong to; absent until the app is linked with `eas init`. */
export function expoProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const id = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === "string" && id ? id : undefined;
}

export async function expoPushToken(projectId: string): Promise<string> {
  const api = await notifications();
  return (await api.getExpoPushTokenAsync({ projectId })).data;
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
    platform: process.env.EXPO_OS === "ios" ? "ios" : "android",
    title: [...`bycoda · ${machineName}`].slice(0, 120).join(""),
    texts,
    events: preferences.events,
    assistantUrgentDuringQuiet: preferences.assistantUrgentDuringQuiet,
  };
}
