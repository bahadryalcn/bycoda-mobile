import { useEffect, useState } from "react";
import { AppState, PermissionsAndroid, Platform } from "react-native";

/** Android 16 gates connections to LAN addresses behind "Nearby devices"; a refusal drops them silently. */
export const LOCAL_NETWORK_PERMISSION = "android.permission.ACCESS_LOCAL_NETWORK";
const LOCAL_NETWORK_API = 36;

/** Older Android has no such permission, and asking about an unknown one would read as denied. */
export const localNetworkGated = (os: string, version: string | number) =>
  os === "android" && Number(version) >= LOCAL_NETWORK_API;

/**
 * True while Android refuses this app access to the local network, so a computer reached by its LAN
 * address can never answer. Re-read whenever the app returns to the foreground, e.g. from Settings.
 */
export function useLocalNetworkDenied(): boolean {
  const [denied, setDenied] = useState(false);
  // The permission lives outside React; read it on mount and after each return from Settings.
  useEffect(() => {
    if (!localNetworkGated(Platform.OS, Platform.Version)) return;
    let live = true;
    const read = () => {
      PermissionsAndroid.check(LOCAL_NETWORK_PERMISSION as never).then(granted => { if (live) setDenied(!granted); }, () => {});
    };
    read();
    const subscription = AppState.addEventListener("change", state => { if (state === "active") read(); });
    return () => { live = false; subscription.remove(); };
  }, []);
  return denied;
}
