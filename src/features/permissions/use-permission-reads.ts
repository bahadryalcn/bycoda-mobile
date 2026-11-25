import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { readDevicePermission, useNotificationPermissionRevision } from "./device-permissions";
import { pendingPermissionReads, permissionKinds, readDevicePermissionStatuses, type PermissionReads } from "./device-permission-status";

/**
 * Passive status reads for summaries (Settings root values). Never requests a permission; re-reads
 * on return to the foreground and after an in-app prompt. Each read carries the shared deadline,
 * so a row can show "unknown" but never stays busy.
 */
export function usePermissionReads(): PermissionReads {
  const [reads, setReads] = useState<PermissionReads>(pendingPermissionReads);
  const mounted = useRef(true);
  const latest = useRef<symbol | null>(null);
  const revision = useNotificationPermissionRevision((state) => state.revision);
  const refresh = useCallback(() => {
    const request = Symbol();
    latest.current = request;
    void readDevicePermissionStatuses(permissionKinds, readDevicePermission, (kind, outcome) => {
      if (mounted.current && latest.current === request) setReads((current) => ({ ...current, [kind]: outcome }));
    });
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // Reason: OS permission state changes outside the app; read it again whenever the app returns.
  useEffect(() => {
    if (process.env.EXPO_OS === "web") return;
    refresh();
    const listener = AppState.addEventListener("change", (state) => { if (state === "active") refresh(); });
    return () => listener.remove();
  }, [refresh, revision]);
  return reads;
}
