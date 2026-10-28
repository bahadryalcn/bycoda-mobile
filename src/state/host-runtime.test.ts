import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileHostRuntimeRegistry } from "./host-runtime";
import { binding, fakeNative } from "../remote/ws-connection.test-fixture";

const registries: MobileHostRuntimeRegistry[] = [];
afterEach(() => {
  for (const registry of registries.splice(0)) registry.close();
  vi.useRealTimers();
});
describe("single app mobile Host supervisor", () => {
  it.each(["lock", "revoke"] as const)(
    "fences a stalled application commit before native %s cleanup settles",
    async (action) => {
      const f = fakeNative();
      const registry = new MobileHostRuntimeRegistry(f.native, "app-a", () => undefined);
      registries.push(registry);
      const lease = registry.retain(binding, ["transport.ws.v2"])!;
      await vi.waitFor(() => expect(lease.state()).toBe("ready"));
      let guard!: () => void,
        release!: () => void,
        writes = 0;
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      lease.subscribe(async (_event, assertCurrent) => {
        guard = assertCurrent;
        await blocked;
        assertCurrent();
        writes++;
        return true;
      });
      f.emit({
        jsonrpc: "2.0",
        method: "subscription.event",
        params: {
          subscriptionId: "subscription-a",
          streamId: "stream-a",
          cursor: { epoch: "epoch-a", sequence: 1 },
          kind: "snapshot",
          data: {},
        },
      });
      await vi.waitFor(() => expect(guard).toBeDefined());
      if (action === "lock") {
        vi.mocked(f.native.setAccess).mockImplementation(() => new Promise(() => undefined));
        registry.setAccess(false, 2);
      } else {
        vi.mocked(f.native.invalidateCredentials).mockImplementation(
          () => new Promise(() => undefined),
        );
        registry.invalidateMachine(binding.machineId);
      }
      expect(() => guard()).toThrow();
      release();
      await vi.waitFor(() => expect(f.native.acknowledge).toHaveBeenCalledTimes(2));
      expect(writes).toBe(0);
      expect(f.sent.filter((request) => request.method === "subscriptions.ack")).toHaveLength(0);
      expect(f.native.open).toHaveBeenCalledTimes(1);
      lease.release();
    },
  );
  it("shares one socket between consumers and closes it at the final detach", async () => {
    const f = fakeNative();
    const registry = new MobileHostRuntimeRegistry(f.native, "app-a", () => undefined);
    registries.push(registry);
    const first = registry.retain(binding, ["transport.ws.v2"])!;
    const second = registry.retain(binding, ["transport.ws.v2"])!;
    await vi.waitFor(() => expect(first.state()).toBe("ready"));
    expect(f.native.open).toHaveBeenCalledTimes(1);
    first.release();
    expect(f.native.close).not.toHaveBeenCalled();
    second.release();
    expect(f.native.close).toHaveBeenCalledTimes(1);
  });
  it("blocks authentication recovery until access changes and discards background handles", async () => {
    const f = fakeNative();
    const registry = new MobileHostRuntimeRegistry(f.native, "app-a", () => undefined);
    registries.push(registry);
    const lease = registry.retain(binding, ["transport.ws.v2"])!;
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    f.event("error", { code: "authentication" });
    await vi.waitFor(() => expect(lease.state()).toBe("blocked"));
    expect(f.native.open).toHaveBeenCalledTimes(1);
    registry.setAccess(false, 2);
    expect(lease.state()).toBe("suspended");
    registry.setAccess(true, 3);
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    expect(f.native.open).toHaveBeenCalledTimes(2);
    expect(f.native.acquireCredential).toHaveBeenLastCalledWith({ ...binding, accessEpoch: 3 });
    lease.release();
  });
  it("preserves the explicit legacy adapter and refuses requests queued during reconnect", async () => {
    const f = fakeNative();
    const registry = new MobileHostRuntimeRegistry(f.native, "app-a", () => undefined);
    registries.push(registry);
    expect(registry.retain(binding, [])).toBeNull();
    const lease = registry.retain(binding, ["transport.ws.v2"])!;
    await expect(
      lease.request("commands.dispatch", { type: "send", text: "draft" }),
    ).rejects.toMatchObject({ uncertain: false });
    lease.release();
  });
  it("reconnects once through the supervisor without replaying an interrupted command", async () => {
    vi.useFakeTimers();
    const f = fakeNative();
    const registry = new MobileHostRuntimeRegistry(
      f.native,
      "app-a",
      () => undefined,
      () => 1,
    );
    registries.push(registry);
    const lease = registry.retain(binding, ["transport.ws.v2"])!;
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    const sent = lease.request("commands.dispatch", {
      type: "cancel",
      commandId: "command-a",
      sessionId: "session-a",
      runId: "run-a",
    });
    f.event("error", { code: "network" });
    await expect(sent).rejects.toMatchObject({ uncertain: true, commandId: "command-a" });
    expect(lease.state()).toBe("backoff");
    await vi.advanceTimersByTimeAsync(249);
    expect(f.native.open).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    expect(f.native.open).toHaveBeenCalledTimes(2);
    expect(f.sent.filter((request) => request.method === "commands.dispatch")).toHaveLength(1);
    lease.release();
  });
});
