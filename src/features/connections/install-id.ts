import * as Application from "expo-application";
import { deviceInstallId } from "../../../../src/integrations/device-proof";

/**
 * Names this phone installation to one computer at pairing, so a phone that was reinstalled
 * replaces its earlier entry there instead of appearing twice.
 *
 * Android only: uninstalling deletes the proof key kept in SecureStore, while `ANDROID_ID` (scoped
 * to the app's signing key, the device and the user) stays the same until a factory reset. iOS
 * keeps the key itself in the keychain across a reinstall, so it proves the earlier key instead
 * and needs no identifier. Only a hash with the computer's ID leaves the phone. Null when the
 * platform has no such identifier or it cannot be read; pairing then simply adds an entry.
 */
export function phoneInstallId(environmentId: string): string | null {
  if (process.env.EXPO_OS !== "android") return null;
  try {
    const androidId = Application.getAndroidId();
    return typeof androidId === "string" && androidId
      ? deviceInstallId(androidId, environmentId)
      : null;
  } catch {
    return null;
  }
}
