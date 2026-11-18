import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileHostRuntimeRegistry, VOICE_READY_TIMEOUT_MS } from "./host-runtime";
import type { MobileMachine } from "../remote/types";
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
  it("re-acquires an expired native credential handle instead of blocking (app returned from background)", async () => {
    const f = fakeNative();
    vi.mocked(f.native.open).mockRejectedValueOnce(
      new Error("Host socket: credential_handle_expired"),
    );
    const registry = new MobileHostRuntimeRegistry(f.native, "app-a", () => 0);
    registries.push(registry);
    const lease = registry.retain(binding, ["transport.ws.v2"])!;
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    expect(vi.mocked(f.native.acquireCredential).mock.calls.length).toBeGreaterThanOrEqual(2);
    lease.release();
  });
  it("retries when native access is briefly unavailable while returning to the foreground", async () => {
    const f = fakeNative();
    vi.mocked(f.native.acquireCredential).mockRejectedValueOnce(new Error("Host socket: unavailable"));
    const registry = new MobileHostRuntimeRegistry(f.native, "app-a", () => 0);
    registries.push(registry);
    const lease = registry.retain(binding, ["transport.ws.v2"])!;
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    lease.release();
  });
  it("reconnects after a failed native access call instead of reporting access denied", async () => {
    const f = fakeNative();
    vi.mocked(f.native.setAccess).mockRejectedValueOnce(new Error("Host socket: busy"));
    const registry = new MobileHostRuntimeRegistry(f.native, "app-a", () => undefined, () => 0);
    registries.push(registry);
    const lease = registry.retain(binding, ["transport.ws.v2"])!;
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    registry.setAccess(false, 2);
    registry.setAccess(true, 3);
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    lease.release();
  });
  it("lets a voice call wait for the shared socket to reconnect after the microphone prompt", async () => {
    const f = fakeNative();
    const voice = vi.fn(async () => {
      throw new Error("voice credential reached");
    });
    Object.assign(f.native, { acquireVoiceCredential: voice, openVoice: vi.fn() });
    const registry = new MobileHostRuntimeRegistry(f.native, "app-a", () => undefined, () => 0);
    registries.push(registry);
    const lease = registry.retain(binding, ["transport.ws.v2"])!;
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    let reconnect!: () => void;
    vi.mocked(f.native.acquireCredential).mockImplementationOnce(async (b) => {
      await new Promise<void>((resolve) => (reconnect = resolve));
      return { handle: "opaque-handle", machineId: b.machineId, environmentId: b.environmentId, credentialGeneration: b.credentialGeneration, accessEpoch: b.accessEpoch };
    });
    // The Android permission dialog pauses the app; returning issues a new access epoch.
    registry.setAccess(false, 2);
    registry.setAccess(true, 3);
    await vi.waitFor(() => expect(reconnect).toBeDefined());
    const machine = { id: binding.machineId, environmentId: binding.environmentId } as MobileMachine;
    const opening = registry.openVoice(machine, { sessionId: "voice-a", threadId: "thread-a" }, () => true);
    opening.catch(() => undefined);
    await Promise.resolve();
    expect(voice).not.toHaveBeenCalled();
    reconnect();
    await expect(opening).rejects.toThrow("voice credential reached");
    lease.release();
  });
  it("stops waiting for the voice socket when the computer stays unreachable", async () => {
    const f = fakeNative();
    const registry = new MobileHostRuntimeRegistry(f.native, "app-a", () => undefined, () => 0);
    registries.push(registry);
    const lease = registry.retain(binding, ["transport.ws.v2"])!;
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    vi.mocked(f.native.acquireCredential).mockImplementationOnce(() => new Promise(() => undefined));
    registry.setAccess(false, 2);
    registry.setAccess(true, 3);
    await vi.waitFor(() => expect(lease.state()).toBe("connecting"));
    vi.useFakeTimers();
    const machine = { id: binding.machineId, environmentId: binding.environmentId } as MobileMachine;
    const opening = registry.openVoice(machine, { sessionId: "voice-a", threadId: "thread-a" }, () => true);
    opening.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(VOICE_READY_TIMEOUT_MS);
    await expect(opening).rejects.toThrow("not ready");
    lease.release();
  });
  it("shares one socket among more than 64 screen clients instead of failing them as busy", async () => {
    const f = fakeNative();
    const registry = new MobileHostRuntimeRegistry(f.native, "app-a", () => undefined, () => 0);
    registries.push(registry);
    const leases = Array.from({ length: 100 }, () => registry.retain(binding, ["transport.ws.v2"])!);
    await vi.waitFor(() => expect(leases[99]!.state()).toBe("ready"));
    for (const lease of leases) lease.onState(() => undefined);
    expect(f.native.open).toHaveBeenCalledTimes(1);
    for (const lease of leases) lease.release();
  });
  it("retries when the app moved while the native credential was read", async () => {
    const f = fakeNative();
    vi.mocked(f.native.acquireCredential).mockRejectedValueOnce(
      new Error("Host socket: access_changed"),
    );
    const registry = new MobileHostRuntimeRegistry(f.native, "app-a", () => 0);
    registries.push(registry);
    const lease = registry.retain(binding, ["transport.ws.v2"])!;
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    lease.release();
  });
  it("re-checks an authentication block while in use, so a Host restart does not leave it stuck", async () => {
    vi.useFakeTimers();
    const f = fakeNative();
    const registry = new MobileHostRuntimeRegistry(f.native, "app-a", () => undefined, () => 0);
    registries.push(registry);
    const lease = registry.retain(binding, ["transport.ws.v2"])!;
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    f.event("error", { code: "authentication" });
    await vi.waitFor(() => expect(lease.state()).toBe("blocked"));
    expect(f.native.open).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20_000);
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    expect(f.native.open).toHaveBeenCalledTimes(2);
    lease.release();
  });
  it("re-acquires the handle after the native side invalidates credentials on a live socket", async () => {
    const f = fakeNative();
    const registry = new MobileHostRuntimeRegistry(f.native, "app-a", () => 0);
    registries.push(registry);
    const lease = registry.retain(binding, ["transport.ws.v2"])!;
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    f.event("error", { code: "credentials_invalidated" });
    await vi.waitFor(() => expect(f.native.acquireCredential).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
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
