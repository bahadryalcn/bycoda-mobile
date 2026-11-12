import Constants from "expo-constants";
import { Platform } from "react-native";
import { releaseChannel, type DeviceInfo } from "./device-registration";

/** What this phone reports to the account service: the name the user sees and basic versions. */
export function readDeviceInfo(): DeviceInfo {
  const ios = process.env.EXPO_OS === "ios";
  const constants = Platform.constants as { Model?: unknown } | undefined;
  const model = !ios && typeof constants?.Model === "string" ? constants.Model : "";
  return {
    name: Constants.deviceName || model || (ios ? "iPhone" : "Android phone"),
    platform: ios ? "ios" : "android",
    osVersion: `${ios ? "iOS" : "Android"} ${String(Platform.Version)}`,
    appVersion: Constants.expoConfig?.version ?? "0.0.0",
    channel: releaseChannel(__DEV__, process.env.EXPO_PUBLIC_RELEASE_CHANNEL),
  };
}
