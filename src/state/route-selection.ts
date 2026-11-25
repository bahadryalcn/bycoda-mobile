import type { MobileMachine, MobileRoute } from "../remote/types";
import { sameRoute } from "./machine-model";
import { routeRank } from "./route-kind";

/** True when the route answers at all; authentication happens on the real connection. */
export type RouteProbe = (route: MobileRoute, signal: AbortSignal) => Promise<boolean>;
export type RouteCheckReason = "foreground" | "machine" | "network" | "failure" | "interval";

export const ROUTE_PROBE_TIMEOUT_MS = 2_500;
/** Tailscale/HTTPS routes get longer: a cold tunnel over mobile data is slow, not down. */
export const ROUTE_REMOTE_PROBE_TIMEOUT_MS = 8_000;
export const ROUTE_RECHECK_INTERVAL_MS = 60_000;
/** Failure and interval checks never run closer together than this. */
export const ROUTE_CHECK_MIN_GAP_MS = 15_000;

/**
 * Local network first (faster, no VPN), then Tailscale, then other addresses. A public-internet
 * route is last: it is used only when every private one failed. Stable within a rank.
 */
export function orderRoutes(routes: readonly MobileRoute[]): MobileRoute[] {
  return routes
    .map((route, index) => ({ route, index }))
    .sort((a, b) => routeRank(a.route) - routeRank(b.route) || a.index - b.index)
    .map(({ route }) => route);
}

/**
 * Probes every route at once and returns the most preferred one that answered,
 * or null when none did. A failed probe never changes the saved connection.
 * Each route has its own deadline: a local address fails fast away from home,
 * while a tailnet route may need seconds for a cold WireGuard handshake on mobile data.
 */
export async function chooseReachableRoute(
  routes: readonly MobileRoute[],
  probe: RouteProbe,
  timeoutMs = ROUTE_PROBE_TIMEOUT_MS,
  remoteTimeoutMs = Math.max(timeoutMs, ROUTE_REMOTE_PROBE_TIMEOUT_MS),
): Promise<MobileRoute | null> {
  const ordered = orderRoutes(routes);
  const timers: ReturnType<typeof setTimeout>[] = [];
  try {
    const results = ordered.map((route) => {
      const controller = new AbortController();
      timers.push(setTimeout(() => controller.abort(), route.lanKey ? timeoutMs : remoteTimeoutMs));
      return probe(route, controller.signal).catch(() => false);
    });
    // Preference order: the first route that answers wins without waiting for the rest.
    for (let index = 0; index < ordered.length; index++) if (await results[index]) return ordered[index]!;
    return null;
  } finally {
    timers.forEach(clearTimeout);
  }
}

export function createRouteSelector(deps: {
  getMachine: () => MobileMachine | null;
  switchRoute: (id: string, route: MobileRoute) => Promise<boolean>;
  probe: RouteProbe;
  canRun: () => boolean;
  now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  let running: Promise<void> | undefined;
  let lastRun = -Infinity;
  return {
    check(reason: RouteCheckReason): Promise<void> {
      const machine = deps.getMachine();
      if (!machine?.routes || machine.routes.length < 2 || !deps.canRun()) return Promise.resolve();
      if (running) return running;
      const urgent = reason === "foreground" || reason === "machine" || reason === "network";
      if (!urgent && now() - lastRun < ROUTE_CHECK_MIN_GAP_MS) return Promise.resolve();
      lastRun = now();
      const routes = machine.routes;
      running = chooseReachableRoute(routes, deps.probe)
        .then(async (chosen) => {
          const latest = deps.getMachine();
          // Switch only if the user is still on the same computer and the app is in use.
          if (!chosen || !latest || latest.id !== machine.id || !deps.canRun()) return;
          if (!sameRoute(latest, chosen)) await deps.switchRoute(latest.id, chosen);
        })
        .catch(() => undefined)
        .finally(() => {
          running = undefined;
        });
      return running;
    },
  };
}
