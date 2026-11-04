import { useCallback, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { draftEpoch, subscribeDraftEpoch } from "./local-draft-storage";
export function useLocalDraftEpoch(key: string) {
  const subscribe = useCallback((listener: () => void) => subscribeDraftEpoch(AsyncStorage, key, listener), [key]);
  const snapshot = useCallback(() => draftEpoch(AsyncStorage, key), [key]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
