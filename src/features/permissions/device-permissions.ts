import { Linking } from "react-native";
import { requestDevicePermission, type DevicePermission } from "./permission-flow";

export type DevicePermissionKind = "camera" | "notifications";
let handlerReady = false;

async function notifications() {
  const api = await import("expo-notifications");
  if (!handlerReady) {
    api.setNotificationHandler({ handleNotification: async () => ({
      shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
    }) });
    handlerReady = true;
  }
  // Android 13+ requires a channel before requesting notification permission.
  if (process.env.EXPO_OS === "android") {
    await api.setNotificationChannelAsync("bycoda", {
      name: "bycoda",
      importance: api.AndroidImportance.DEFAULT,
      lockscreenVisibility: api.AndroidNotificationVisibility.PRIVATE,
    });
  }
  return api;
}

export async function readDevicePermission(kind: DevicePermissionKind): Promise<DevicePermission> {
  if (process.env.EXPO_OS === "web") return { granted: false, canAskAgain: false, status: "unavailable" };
  if (kind === "camera") {
    const camera = await import("expo-camera");
    return camera.Camera.getCameraPermissionsAsync();
  }
  const api = await notifications();
  const response = await api.getPermissionsAsync();
  return {
    ...response,
    granted: response.granted || response.ios?.status === api.IosAuthorizationStatus.PROVISIONAL ||
      response.ios?.status === api.IosAuthorizationStatus.EPHEMERAL,
  };
}

export async function allowDevicePermission(kind: DevicePermissionKind) {
  if (process.env.EXPO_OS === "web") return readDevicePermission(kind);
  return requestDevicePermission(
    () => readDevicePermission(kind),
    async () => {
      if (kind === "camera") {
        const camera = await import("expo-camera");
        return camera.Camera.requestCameraPermissionsAsync();
      }
      const api = await notifications();
      return api.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
    },
    () => Linking.openSettings(),
  );
}

export async function testDeviceNotification(title: string, body: string) {
  const permission = await readDevicePermission("notifications");
  if (!permission.granted) throw new Error("Notification permission is required.");
  const api = await notifications();
  await api.scheduleNotificationAsync({
    content: { title, body, sound: "default" },
    trigger: { type: api.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3, channelId: "bycoda" },
  });
}
