import { describe, expect, it, vi } from "vitest";
import type { MobileMachine, MobileRoute } from "../remote/types";
import { betterRoutes, chooseReachableRoute, createRouteSelector, orderRoutes } from "./route-selection";

const lan: MobileRoute = { endpoint: "http://192.168.2.108:63888", lanKey: "ab".repeat(32) };
const tailscale: MobileRoute = { endpoint: "https://bab.tail12e784.ts.net" };
const machine = (active: MobileRoute): MobileMachine => ({
  id: "bab",
  name: "bab",
  environmentId: "env",
  ...active,
  routes: [active, ...[lan, tailscale].filter((route) => route !== active)],
});

describe("route selection", () => {
  it("prefers the local network over other routes", () => {
    expect(orderRoutes([tailscale, lan])).toEqual([lan, tailscale]);
  });

  it("picks the local network at home and falls back to Tailscale away", async () => {
    expect(await chooseReachableRoute([tailscale, lan], async () => true)).toBe(lan);
    expect(await chooseReachableRoute([tailscale, lan], async (route) => !route.lanKey)).toBe(
      tailscale,
    );
    expect(await chooseReachableRoute([tailscale, lan], async () => false)).toBeNull();
  });

  it("treats a probe that hangs past the deadline as unreachable", async () => {
    const hanging = (signal: AbortSignal) =>
      new Promise<boolean>((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted"))),
      );
    const chosen = await chooseReachableRoute(
      [lan, tailscale],
      (route, signal) => (route.lanKey ? hanging(signal) : Promise.resolve(true)),
      10,
    );
    expect(chosen).toBe(tailscale);
  });

  it("gives a slow Tailscale route longer than the local network, which fails fast away from home", async () => {
    vi.useFakeTimers();
    try {
      const probe = (route: MobileRoute, signal: AbortSignal) =>
        new Promise<boolean>((resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
          // A cold tailnet handshake answers after the local-network deadline.
          if (!route.lanKey) setTimeout(() => resolve(true), 4_000);
        });
      const chosen = chooseReachableRoute([lan, tailscale], probe);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(await chosen).toBe(tailscale);
    } finally {
      vi.useRealTimers();
    }
  });

  it("switches the active computer to the reachable route and keeps it when unchanged", async () => {
    let current = machine(tailscale);
    const switchRoute = vi.fn(async (_id: string, route: MobileRoute) => {
      current = { ...current, endpoint: route.endpoint, lanKey: route.lanKey };
      return true;
    });
    const selector = createRouteSelector({
      getMachine: () => current,
      switchRoute,
      probe: async () => true,
      canRun: () => true,
    });
    await selector.check("foreground");
    expect(switchRoute).toHaveBeenCalledWith("bab", lan);
    await selector.check("foreground");
    expect(switchRoute).toHaveBeenCalledTimes(1);
  });

  it("does nothing for single-route computers, while locked, or when nothing answers", async () => {
    const switchRoute = vi.fn(async () => true);
    const probe = vi.fn(async () => true);
    await createRouteSelector({
      getMachine: () => ({ id: "one", name: "one", environmentId: "env", ...tailscale }),
      switchRoute,
      probe,
      canRun: () => true,
    }).check("foreground");
    await createRouteSelector({
      getMachine: () => machine(tailscale),
      switchRoute,
      probe,
      canRun: () => false,
    }).check("foreground");
    expect(probe).not.toHaveBeenCalled();
    await createRouteSelector({
      getMachine: () => machine(tailscale),
      switchRoute,
      probe: async () => false,
      canRun: () => true,
    }).check("foreground");
    expect(switchRoute).not.toHaveBeenCalled();
  });

  it("throttles failure and interval checks but always checks on return to the app", async () => {
    let time = 100_000;
    const probe = vi.fn(async (_route: MobileRoute) => false);
    const selector = createRouteSelector({
      getMachine: () => machine(lan),
      switchRoute: async () => true,
      probe,
      canRun: () => true,
      now: () => time,
    });
    await selector.check("failure");
    expect(probe).toHaveBeenCalledTimes(2);
    time += 1_000;
    await selector.check("interval");
    expect(probe).toHaveBeenCalledTimes(2);
    await selector.check("foreground");
    expect(probe).toHaveBeenCalledTimes(4);
  });

  it("does not switch if the user changed computers while probing", async () => {
    let current: MobileMachine = machine(tailscale);
    const switchRoute = vi.fn(async () => true);
    await createRouteSelector({
      getMachine: () => current,
      switchRoute,
      probe: async () => {
        current = { id: "other", name: "other", environmentId: "e2", ...tailscale };
        return true;
      },
      canRun: () => true,
    }).check("foreground");
    expect(switchRoute).not.toHaveBeenCalled();
  });

  it("re-probes a connected computer only for a better route on the interval", async () => {
    expect(betterRoutes([tailscale, lan], lan)).toEqual([]);
    expect(betterRoutes([tailscale, lan], tailscale)).toEqual([lan]);
    let time = 100_000;
    const probe = vi.fn(async (_route: MobileRoute) => false);
    const atHome = createRouteSelector({ getMachine: () => machine(lan), switchRoute: async () => true, probe,
      canRun: () => true, isConnected: () => true, now: () => time });
    await atHome.check("interval");
    expect(probe).not.toHaveBeenCalled();
    // Failures and returning to the app still probe every route.
    await atHome.check("failure");
    expect(probe).toHaveBeenCalledTimes(2);
    probe.mockClear();
    time += 60_000;
    await createRouteSelector({ getMachine: () => machine(tailscale), switchRoute: async () => true, probe,
      canRun: () => true, isConnected: () => true, now: () => time }).check("interval");
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe.mock.calls[0]?.[0]).toBe(lan);
  });
});
