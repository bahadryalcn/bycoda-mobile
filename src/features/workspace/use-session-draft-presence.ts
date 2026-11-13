import { useCallback, useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSecurity } from "@/state/security";
import { draftPresence, hydrateDraftPresence, subscribeDraftPresence } from "@/state/local-draft-storage";
import { composerDraftKey } from "./attachment-ownership";
import { decodeComposerDraft, encodeComposerDraft } from "./composer-draft";

function hasContent(raw: string) {
  return encodeComposerDraft(decodeComposerDraft(raw)) !== null;
}
export function useSessionDraftPresence(machineId: string, sessionId: string, allowed: boolean, hostDraft = false) {
  const unlocked = useSecurity(state => state.status === "unlocked");
  const key = composerDraftKey(machineId, sessionId);
  const enabled = allowed && unlocked;
  const subscribe = useCallback((listener: () => void) => enabled ? subscribeDraftPresence(AsyncStorage, key, listener) : () => {}, [key, enabled]);
  const snapshot = useCallback(() => enabled && draftPresence(AsyncStorage, key), [key, enabled]);
  const present = useSyncExternalStore(subscribe, snapshot, snapshot);
  // Hydrate mounted rows only; storage owner deduplicates reads and orders cleanup.
  useEffect(() => {
    if (enabled) void hydrateDraftPresence(AsyncStorage, key, hasContent).catch(() => {});
  }, [key, enabled]);
  return enabled && (present || hostDraft);
}
