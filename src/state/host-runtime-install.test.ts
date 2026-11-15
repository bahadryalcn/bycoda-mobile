import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HostSocketNative } from "../../modules/bycoda-host-socket/src/types";
import { fakeNative, binding } from "../remote/ws-connection.test-fixture";
import { getHostWsRuntimeProvider } from "../remote/ws-runtime-port";
import publicCa from "../../modules/bycoda-host-socket/fixtures/public-ca-pin-vector.json";
import { useAccountAccess } from "../features/account/model/account-access";

const fixture = vi.hoisted(() => ({
  native: null as HostSocketNative | null,
  unlocked: true,
  appState: {
    currentState: "active" as string,
    listeners: new Set<(state: string) => void>(),
    addEventListener(_event: string, listener: (state: string) => void) {
      fixture.appState.listeners.add(listener);
      return { remove: () => fixture.appState.listeners.delete(listener) };
    },
    set(state: string) {
      fixture.appState.currentState = state;
      for (const listener of fixture.appState.listeners) listener(state);
    },
  },
  securityListeners: new Set<() => void>(),
  machineListeners: new Set<(state: unknown) => void>(),
  state: {
    machines: [
      {
        id: "machine-a",
        endpoint: "https://host.example",
        environmentId: "environment-a",
        lanKey: undefined as string | undefined,
      },
    ],
    hydrated: true,
    storageError: null,
    connectionPending: false,
  },
}));
vi.mock("../../modules/bycoda-host-socket", () => ({ nativeHostSocket: () => fixture.native }));
vi.mock("react-native", () => ({ AppState: fixture.appState }));
vi.mock("./security", () => ({
  useSecurity: {
    subscribe: (listener: () => void) => {
      fixture.securityListeners.add(listener);
      return () => fixture.securityListeners.delete(listener);
    },
  },
  isAppAccessAllowed: () => fixture.unlocked,
  assertAppAccess: () => {
    if (!fixture.unlocked) throw new Error("Locked");
  },
}));
vi.mock("./machines", () => ({
  useMachines: {
    getState: () => fixture.state,
    subscribe: (listener: (state: unknown) => void) => {
      fixture.machineListeners.add(listener);
      return () => fixture.machineListeners.delete(listener);
    },
  },
}));

import { BACKGROUND_GRACE_MS, installMobileHostRuntime } from "./host-runtime";
const releases: (() => void)[] = [];
const descriptor = {
  protocolVersion: 1,
  environmentId: binding.environmentId,
  name: "Host",
  providers: ["codex" as const],
  capabilities: ["transport.ws.sessions.v2", "transport.ws.streams.v2"],
  mobileTls: {
    version: 1 as const,
    environmentId: binding.environmentId,
    caGeneration: 1,
    caCertificatePem: publicCa.caCertificatePem,
    caSpkiPin: publicCa.caSpkiPin,
    endpoint: "wss://host.example/ws",
    bulkBaseUrl: "https://host.example/ws-bulk/",
  },
};
beforeEach(() => {
  useAccountAccess.setState({ status: "signedIn" });
  fixture.unlocked = true;
  fixture.appState.currentState = "active";
  fixture.native = fakeNative().native;
});
afterEach(() => {
  for (const release of releases.splice(0).reverse()) release();
});
describe("mobile app lifecycle and authenticated trust composition", () => {
  it("closes the live Host socket immediately on account sign-out without waiting for a lock event", async () => {
    const installed = await installMobileHostRuntime();
    releases.push(installed.dispose);
    const provider = getHostWsRuntimeProvider()!;
    const machine = { ...fixture.state.machines[0]!, name: "Host", capabilities: descriptor.capabilities };
    const lease = await provider.acquire(machine, async () => descriptor, () => undefined);
    releases.push(lease.release);
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    fixture.unlocked = false;
    useAccountAccess.setState({ status: "signedOut" });
    expect(lease.state()).toBe("suspended");
    expect(fixture.native!.close).toHaveBeenCalled();
  });
  it("shares installation across StrictMode effect replay and unregisters the final owner", async () => {
    const [first, second] = await Promise.all([
      installMobileHostRuntime(),
      installMobileHostRuntime(),
    ]);
    releases.push(first.dispose, second.dispose);
    expect(first.registry).toBe(second.registry);
    first.dispose();
    expect(getHostWsRuntimeProvider()).toBeDefined();
    second.dispose();
    expect(getHostWsRuntimeProvider()).toBeUndefined();
  });
  it("reopens the native gate with a newer epoch after any background stay, however short", async () => {
    // The native module closes its gate on every background event and only a newer epoch
    // reopens it. Returning inside the grace without one left every later attempt failing with
    // "unavailable" ("Can't reach your computer" on a working network) until the app restarted.
    vi.useFakeTimers();
    try {
      const installed = await installMobileHostRuntime();
      releases.push(installed.dispose);
      const provider = getHostWsRuntimeProvider()!;
      const machine = {
        id: binding.machineId,
        name: "Host",
        environmentId: binding.environmentId,
        endpoint: "https://host.example",
        capabilities: descriptor.capabilities,
      };
      const lease = await provider.acquire(machine, async () => descriptor, () => undefined);
      releases.push(lease.release);
      await vi.waitFor(() => expect(lease.state()).toBe("ready"));
      const granted = () =>
        vi.mocked(fixture.native!.setAccess).mock.calls.filter(([active]) => active).map(([, epoch]) => epoch);
      const before = Math.max(...granted());

      fixture.appState.set("background");
      await vi.advanceTimersByTimeAsync(2_000);
      fixture.appState.set("active");
      await vi.waitFor(() => expect(Math.max(...granted())).toBeGreaterThan(before));
      await vi.waitFor(() => expect(lease.state()).toBe("ready"));
      expect(fixture.native!.open).toHaveBeenCalledTimes(2);

      fixture.appState.set("background");
      await vi.advanceTimersByTimeAsync(BACKGROUND_GRACE_MS);
      expect(lease.state()).toBe("suspended");
      fixture.appState.set("active");
      await vi.waitFor(() => expect(lease.state()).toBe("ready"));
      expect(fixture.native!.open).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
  it("closes immediately when the app locks, regardless of the background grace", async () => {
    const installed = await installMobileHostRuntime();
    releases.push(installed.dispose);
    const provider = getHostWsRuntimeProvider()!;
    const machine = {
      id: binding.machineId,
      name: "Host",
      environmentId: binding.environmentId,
      endpoint: "https://host.example",
      capabilities: descriptor.capabilities,
    };
    const lease = await provider.acquire(machine, async () => descriptor, () => undefined);
    releases.push(lease.release);
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    fixture.appState.set("background");
    fixture.unlocked = false;
    for (const listener of fixture.securityListeners) listener();
    expect(lease.state()).toBe("suspended");
  });
  it("coalesces authenticated bootstrap and consumers onto one native connection", async () => {
    const installed = await installMobileHostRuntime();
    releases.push(installed.dispose);
    const provider = getHostWsRuntimeProvider()!;
    const read = vi.fn(async () => descriptor);
    const machine = {
      id: binding.machineId,
      name: "Host",
      environmentId: binding.environmentId,
      endpoint: "https://host.example",
      capabilities: descriptor.capabilities,
    };
    const [first, second] = await Promise.all([
      provider.acquire(machine, read, () => undefined),
      provider.acquire(machine, read, () => undefined),
    ]);
    releases.push(first.release, second.release);
    await vi.waitFor(() => expect(first.state()).toBe("ready"));
    expect(read).toHaveBeenCalledTimes(1);
    expect(fixture.native!.open).toHaveBeenCalledTimes(1);
    // An HTTPS route keeps its own public-CA socket even when the Host also
    // advertises its local-network WSS bootstrap.
    expect(fixture.native!.acquireCredential).toHaveBeenCalledWith(
      expect.objectContaining({ machineId: binding.machineId, endpoint: "wss://host.example/ws" }),
    );
    expect(vi.mocked(fixture.native!.acquireCredential).mock.calls[0]?.[0]).not.toHaveProperty(
      "tls",
    );
  });
  it("uses the paired local-network WSS listener only on the local-network route", async () => {
    const installed = await installMobileHostRuntime();
    releases.push(installed.dispose);
    const provider = getHostWsRuntimeProvider()!;
    const lease = await provider.acquire(
      {
        id: binding.machineId,
        name: "Host",
        environmentId: binding.environmentId,
        endpoint: "http://192.168.1.2:8888",
        lanKey: "a".repeat(64),
        capabilities: descriptor.capabilities,
      },
      async () => descriptor,
      () => undefined,
    );
    releases.push(lease.release);
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    expect(fixture.native!.acquireCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: descriptor.mobileTls.endpoint,
        tls: expect.objectContaining({ caSpkiPin: publicCa.caSpkiPin }),
      }),
    );
  });
  it("refuses missing private-LAN TLS trust and same-generation CA key changes", async () => {
    const installed = await installMobileHostRuntime();
    releases.push(installed.dispose);
    const provider = getHostWsRuntimeProvider()!;
    const machine = {
      id: binding.machineId,
      name: "Host",
      environmentId: binding.environmentId,
      endpoint: "http://192.168.1.2:8888",
      lanKey: "a".repeat(64),
      capabilities: descriptor.capabilities,
    };
    await expect(
      provider.acquire(
        machine,
        async () => ({ ...descriptor, mobileTls: undefined }),
        () => undefined,
      ),
    ).rejects.toMatchObject({ kind: "unsupported" });
    expect(fixture.native!.acquireCredential).not.toHaveBeenCalled();
    provider.remember(machine, descriptor);
    expect(() =>
      provider.remember(machine, {
        ...descriptor,
        mobileTls: { ...descriptor.mobileTls, caSpkiPin: "sha256/" + "a".repeat(43) + "=" },
      }),
    ).toThrow(/generation/);
  });
  it.each(["http://192.168.1.2:8888", "http://100.100.1.2:8888"])(
    "keeps %s live across equivalent authenticated descriptor refreshes",
    async (endpoint) => {
      const installed = await installMobileHostRuntime();
      releases.push(installed.dispose);
      const provider = getHostWsRuntimeProvider()!;
      const machine = {
        id: binding.machineId,
        name: "Host",
        environmentId: binding.environmentId,
        endpoint,
        lanKey: "a".repeat(64),
        capabilities: descriptor.capabilities,
      };
      const lease = await provider.acquire(
        machine,
        async () => descriptor,
        () => undefined,
      );
      releases.push(lease.release);
      await vi.waitFor(() => expect(lease.state()).toBe("ready"));
      const closed = vi.mocked(fixture.native!.close).mock.calls.length;
      const tls = descriptor.mobileTls;
      provider.remember(machine, {
        ...descriptor,
        capabilities: [...descriptor.capabilities].reverse(),
        mobileTls: {
          endpoint: tls.endpoint,
          bulkBaseUrl: tls.bulkBaseUrl,
          caSpkiPin: tls.caSpkiPin,
          caCertificatePem: tls.caCertificatePem,
          caGeneration: tls.caGeneration,
          environmentId: tls.environmentId,
          version: tls.version,
        },
      });
      expect(lease.state()).toBe("ready");
      expect(fixture.native!.close).toHaveBeenCalledTimes(closed);
      expect(fixture.native!.open).toHaveBeenCalledTimes(1);
      provider.remember(machine, {
        ...descriptor,
        mobileTls: {
          ...tls,
          endpoint: "wss://host.example:8443/ws",
          bulkBaseUrl: "https://host.example:8443/ws-bulk/",
        },
      });
      expect(lease.state()).toBe("closed");
      expect(fixture.native!.close).toHaveBeenCalledTimes(closed + 1);
    },
  );
});
