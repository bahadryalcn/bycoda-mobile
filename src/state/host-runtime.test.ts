import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IDLE_RELEASE_GRACE_MS,
  MobileHostRuntimeRegistry,
  VOICE_READY_TIMEOUT_MS,
} from "./host-runtime";
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
  it("shares one socket between consumers and closes it after the idle grace of the final detach", async () => {
    const f = fakeNative();
    const registry = new MobileHostRuntimeRegistry(f.native, "app-a", () => undefined);
    registries.push(registry);
    const first = registry.retain(binding, ["transport.ws.v2"])!;
    const second = registry.retain(binding, ["transport.ws.v2"])!;
    await vi.waitFor(() => expect(first.state()).toBe("ready"));
    expect(f.native.open).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
    first.release();
    expect(f.native.close).not.toHaveBeenCalled();
    second.release();
    expect(f.native.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(IDLE_RELEASE_GRACE_MS - 1);
    expect(f.native.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(f.native.close).toHaveBeenCalledTimes(1);
  });
  it("reuses the live socket when a replacement lease is retained within the idle grace", async () => {
    const f = fakeNative();
    const registry = new MobileHostRuntimeRegistry(f.native, "app-a", () => undefined);
    registries.push(registry);
    const first = registry.retain(binding, ["transport.ws.v2"])!;
    await vi.waitFor(() => expect(first.state()).toBe("ready"));
    vi.useFakeTimers();
    first.release();
    const second = registry.retain(binding, ["transport.ws.v2"])!;
    expect(second.state()).toBe("ready");
    vi.advanceTimersByTime(IDLE_RELEASE_GRACE_MS * 2);
    expect(f.native.open).toHaveBeenCalledTimes(1);
    expect(f.native.close).not.toHaveBeenCalled();
    expect(second.state()).toBe("ready");
    second.release();
    vi.advanceTimersByTime(IDLE_RELEASE_GRACE_MS);
    expect(f.native.close).toHaveBeenCalledTimes(1);
  });
  it.each(["revoke", "lock", "close"] as const)(
    "closes a lingering socket at once on %s",
    async (action) => {
      const f = fakeNative();
      const registry = new MobileHostRuntimeRegistry(f.native, "app-a", () => undefined);
      registries.push(registry);
      const lease = registry.retain(binding, ["transport.ws.v2"])!;
      await vi.waitFor(() => expect(lease.state()).toBe("ready"));
      vi.useFakeTimers();
      lease.release();
      expect(f.native.close).not.toHaveBeenCalled();
      if (action === "revoke") registry.invalidateMachine(binding.machineId);
      else if (action === "lock") registry.setAccess(false, 2);
      else registry.close();
      expect(f.native.close).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(IDLE_RELEASE_GRACE_MS * 2);
      expect(f.native.close).toHaveBeenCalledTimes(1);
    },
  );
  it("does not reuse a lingering socket for a changed route or authority", async () => {
    const f = fakeNative();
    const registry = new MobileHostRuntimeRegistry(f.native, "app-a", () => undefined);
    registries.push(registry);
    const first = registry.retain(binding, ["transport.ws.v2"])!;
    await vi.waitFor(() => expect(first.state()).toBe("ready"));
    vi.useFakeTimers();
    first.release();
    const next = registry.retain(
      { ...binding, credentialGeneration: binding.credentialGeneration + 1 },
      ["transport.ws.v2"],
    )!;
    expect(f.native.close).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    await vi.waitFor(() => expect(next.state()).toBe("ready"));
    expect(f.native.open).toHaveBeenCalledTimes(2);
    next.release();
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
  it("bounds automatic re-checks of a rejected credential and restarts them on a new lease", async () => {
    vi.useFakeTimers();
    const f = fakeNative();
    const acquire = vi.mocked(f.native.acquireCredential);
    const registry = new MobileHostRuntimeRegistry(f.native, "app-a", () => undefined, () => 0);
    registries.push(registry);
    const lease = registry.retain(binding, ["transport.ws.v2"])!;
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    // Every automatic re-check is rejected with the same authentication failure.
    for (let i = 0; i < 4; i++) acquire.mockRejectedValueOnce(new Error("Host socket: revoked"));
    const before = acquire.mock.calls.length;
    f.event("error", { code: "authentication" });
    await vi.waitFor(() => expect(lease.state()).toBe("blocked"));
    for (const [index, delay] of [20_000, 60_000, 300_000, 900_000].entries()) {
      await vi.advanceTimersByTimeAsync(delay);
      await vi.waitFor(() => expect(acquire).toHaveBeenCalledTimes(before + index + 1));
    }
    // The ladder is exhausted: no further automatic attempts, however long the view stays mounted.
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(acquire).toHaveBeenCalledTimes(before + 4);
    expect(lease.state()).toBe("blocked");
    // A new lease is a real recovery event: it starts a fresh ladder and reconnects.
    lease.release();
    const next = registry.retain(binding, ["transport.ws.v2"])!;
    await vi.advanceTimersByTimeAsync(20_000);
    await vi.waitFor(() => expect(next.state()).toBe("ready"));
    next.release();
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
  /** Drops a ready socket and fails the next two attempts, leaving a 1 s retry timer pending. */
  async function failedLadder() {
    vi.useFakeTimers();
    const f = fakeNative();
    const registry = new MobileHostRuntimeRegistry(f.native, "app-a", () => undefined, () => 1);
    registries.push(registry);
    const lease = registry.retain(binding, ["transport.ws.v2"])!;
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    const acquire = vi.mocked(f.native.acquireCredential);
    for (let i = 0; i < 2; i++) acquire.mockRejectedValueOnce(new Error("Host socket: unavailable"));
    f.event("error", { code: "network" });
    await vi.waitFor(() => expect(lease.state()).toBe("backoff"));
    // Delays of 250 ms and 500 ms fail; the third retry would wait 1 s.
    await vi.advanceTimersByTimeAsync(750);
    await vi.waitFor(() => expect(acquire).toHaveBeenCalledTimes(3));
    expect(lease.state()).toBe("backoff");
    return { f, registry, lease, acquire };
  }
  /** After recovery the next drop must wait only the first rung (250 ms), not the grown ladder. */
  async function expectFreshLadder(f: ReturnType<typeof fakeNative>, lease: { state(): string }) {
    const opened = vi.mocked(f.native.open).mock.calls.length;
    f.event("error", { code: "network" });
    // The failure is applied synchronously; a fake-timer waitFor would advance the clock and eat the rung.
    expect(lease.state()).toBe("backoff");
    await vi.advanceTimersByTimeAsync(249);
    expect(f.native.open).toHaveBeenCalledTimes(opened);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    expect(f.native.open).toHaveBeenCalledTimes(opened + 1);
  }
  it("retries at once with a fresh ladder when the network returns during a backoff", async () => {
    const { f, registry, lease, acquire } = await failedLadder();
    registry.networkRegained();
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    expect(f.native.open).toHaveBeenCalledTimes(2);
    // Same computer, credential generation and access epoch as the original attempt.
    expect(acquire.mock.calls.at(-1)?.[0]).toEqual(acquire.mock.calls[0]?.[0]);
    await expectFreshLadder(f, lease);
    lease.release();
  });
  it("leaves a healthy socket and a closed registry alone when the network is reported back", async () => {
    vi.useFakeTimers();
    const f = fakeNative();
    const registry = new MobileHostRuntimeRegistry(f.native, "app-a", () => undefined, () => 1);
    registries.push(registry);
    const lease = registry.retain(binding, ["transport.ws.v2"])!;
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    registry.networkRegained();
    expect(lease.state()).toBe("ready");
    expect(f.native.open).toHaveBeenCalledTimes(1);
    registry.close();
    registry.networkRegained();
    expect(f.native.open).toHaveBeenCalledTimes(1);
  });
  it("resets the reconnect ladder when the app returns to the foreground", async () => {
    const { f, registry, lease } = await failedLadder();
    registry.setAccess(false, 2);
    expect(lease.state()).toBe("suspended");
    registry.setAccess(true, 3);
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    expect(f.native.open).toHaveBeenCalledTimes(2);
    await expectFreshLadder(f, lease);
    lease.release();
  });
});
