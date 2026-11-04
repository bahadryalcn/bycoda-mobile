import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HostSocketNative } from "../../modules/bycoda-host-socket/src/types";
import { fakeNative, binding } from "../remote/ws-connection.test-fixture";
import { getHostWsRuntimeProvider } from "../remote/ws-runtime-port";
import publicCa from "../../modules/bycoda-host-socket/fixtures/public-ca-pin-vector.json";

const fixture = vi.hoisted(() => ({
  native: null as HostSocketNative | null,
  unlocked: true,
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
vi.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: () => ({ remove: () => undefined }) },
}));
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

import { installMobileHostRuntime } from "./host-runtime";
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
  fixture.unlocked = true;
  fixture.native = fakeNative().native;
});
afterEach(() => {
  for (const release of releases.splice(0).reverse()) release();
});
describe("mobile app lifecycle and authenticated trust composition", () => {
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
    expect(fixture.native!.acquireCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        machineId: binding.machineId,
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
