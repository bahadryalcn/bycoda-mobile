import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

// The app lifecycle feeds NetInfo's device connectivity into the online manager.
export const deviceIsOffline = () => !onlineManager.isOnline();
const subscribe = (listener: () => void) => onlineManager.subscribe(listener);

export function useDeviceOffline() {
  return useSyncExternalStore(subscribe, deviceIsOffline, deviceIsOffline);
}
