import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { nativeHostFetch } from "../remote/native-fetch";
import type { MobileRoute } from "../remote/types";
import type { MobileHostRuntimeState } from "./host-runtime";
import { isMachinePending, useMachines } from "./machines";
import {
  createRouteSelector,
  ROUTE_RECHECK_INTERVAL_MS,
  type RouteProbe,
} from "./route-selection";
import { isAppAccessAllowed } from "./security";

/** Any HTTP answer proves reachability; a local listener must also answer its hello. */
const probeRoute: RouteProbe = async (route: MobileRoute, signal) => {
  try {
    const response = await nativeHostFetch(
      route.lanKey ? `${route.endpoint}/mobile/lan/hello` : `${route.endpoint}/`,
      { method: "GET", signal, redirect: "error", credentials: "omit", cache: "no-store" },
    );
    return route.lanKey ? response.ok : true;
  } catch {
    return false;
  }
};

/**
 * Keeps the active computer on the best reachable route: local network at home,
 * another paired route such as Tailscale elsewhere. Runs only while the app is
 * unlocked and in front.
 */
export function startRouteSelection() {
  const selector = createRouteSelector({
    getMachine: () => {
      const state = useMachines.getState();
      if (!state.hydrated || state.storageError) return null;
      const active = state.machines.find((machine) => machine.id === state.activeId) ?? null;
      // Another computer's pairing or removal must not pause this computer's route checks.
      return active && !isMachinePending(state, active.id) ? active : null;
    },
    switchRoute: (id, route) => useMachines.getState().switchRoute(id, route),
    probe: probeRoute,
    canRun: () => isAppAccessAllowed() && AppState.currentState === "active",
  });
  let activeId = useMachines.getState().activeId;
  let hydrated = useMachines.getState().hydrated;
  const machines = useMachines.subscribe((state) => {
    if (state.activeId === activeId && state.hydrated === hydrated) return;
    activeId = state.activeId;
    hydrated = state.hydrated;
    void selector.check("machine");
  });
  const lifecycle = AppState.addEventListener("change", (state) => {
    if (state === "active") void selector.check("foreground");
  });
  // Wi-Fi to mobile data (or another network) invalidates the chosen route immediately.
  let networkKey: string | undefined;
  const network = NetInfo.addEventListener((state) => {
    const key = `${state.type}:${state.isConnected}:${(state.details as { ssid?: string } | null)?.ssid ?? ""}`;
    const changed = networkKey !== undefined && key !== networkKey;
    networkKey = key;
    if (changed && state.isConnected !== false) void selector.check("network");
  });
  const timer = setInterval(() => void selector.check("interval"), ROUTE_RECHECK_INTERVAL_MS);
  void selector.check("foreground");
  return {
    /** A socket that keeps failing may mean the network changed under it. */
    runtimeState(machineId: string, state: MobileHostRuntimeState) {
      if (state === "backoff" && machineId === useMachines.getState().activeId)
        void selector.check("failure");
    },
    dispose() {
      machines();
      lifecycle.remove();
      network();
      clearInterval(timer);
    },
  };
}
