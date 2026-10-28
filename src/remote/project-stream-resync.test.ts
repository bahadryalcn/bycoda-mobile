import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { MobileHostRuntimeRegistry } from "../state/host-runtime";
import { HostTransport } from "./host-transport";
import { watchProjectStream } from "./session-sync";
import { binding, fakeNative } from "./ws-connection.test-fixture";
import { registerHostWsRuntimeProvider } from "./ws-runtime-port";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

it.each(["bulk", "commit"] as const)(
  "resnapshots a project before stalled %s settles, retaining I/O reservations and rejecting stale apply/ACK",
  async (mode) => {
    const f = fakeNative();
    const capabilities = ["transport.ws.read.v2", "transport.ws.streams.v2"];
    const registry = new MobileHostRuntimeRegistry(f.native, "resync-test", () => undefined);
    cleanups.push(() => registry.close());
    const lease = registry.retain(binding, capabilities)!;
    await vi.waitFor(() => expect(lease.state()).toBe("ready"));
    cleanups.push(registerHostWsRuntimeProvider({ acquire: async () => lease, remember: vi.fn() }));
    const client = new HostTransport(
      {
        id: binding.machineId,
        environmentId: binding.environmentId,
        endpoint: "https://host.example",
        name: "Host",
        capabilities,
      },
      async () => {
        throw new Error("No JS credential access");
      },
    );
    cleanups.push(() => client.dispose());
    let streams = 0;
    const heldIo = new Map<string, (value: { dataBase64: string }) => void>();
    vi.mocked(f.native.readBulk).mockImplementation(
      async (_handle, descriptor) =>
        await new Promise((resolve) => {
          heldIo.set(descriptor.transferId, resolve);
        }),
    );
    const descriptor = (transferId: string, bytes: Buffer) => ({
      kind: "bulk" as const,
      transferId,
      environmentId: binding.environmentId,
      totalBytes: bytes.length,
      chunkBytes: 65_536,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      expiresAt: Date.now() + 30_000,
    });
    const probeBytes = Buffer.from("[]");
    let probes = 0;
    f.respond((request) =>
      request.method === "subscriptions.open"
        ? { subscriptionId: request.params.subscriptionId, streamId: `stream-${++streams}` }
        : request.method === "projects.list"
          ? { $bulk: descriptor(`probe-${++probes}`, probeBytes) }
          : { accepted: true },
    );
    let releaseCommit!: () => void;
    const blocked = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    let staleGuard: (() => void) | undefined;
    let visible: string[] = [],
      applied: string[] = [];
    const errors: Error[] = [];
    await watchProjectStream(
      client,
      "project-a",
      async (value, assertCurrent) => {
        if (value.etag === "stale" && mode === "commit") {
          staleGuard = assertCurrent;
          await blocked;
        }
        assertCurrent();
        visible = value.sessions.map((session) => session.id);
        applied.push(value.etag);
      },
      (error) => errors.push(error),
    );
    const opens = () => f.sent.filter((request) => request.method === "subscriptions.open");
    await vi.waitFor(() => expect(opens()).toHaveLength(1));
    const firstId = opens()[0]!.params.subscriptionId as string;
    const first = { subscriptionId: firstId, streamId: "stream-1" };
    const removedRow = {
      id: "deleted-session",
      title: "Deleted",
      harness: "codex",
      projectId: "project-a",
      revision: 1,
      status: "idle",
      updatedAt: 1,
    };
    f.emit({
      jsonrpc: "2.0",
      method: "subscription.event",
      params: {
        ...first,
        cursor: { epoch: "old-epoch", sequence: 1 },
        kind: "snapshot",
        data: { etag: "baseline", sessions: [removedRow] },
      },
    });
    await vi.waitFor(() => expect(applied).toEqual(["baseline"]));
    const stale = { etag: "stale", sessions: [removedRow] };
    const staleBytes = Buffer.from(JSON.stringify(stale));
    f.event("message", {
      sequence: 10_001,
      text: JSON.stringify({
        jsonrpc: "2.0",
        method: "subscription.event",
        params: {
          ...first,
          cursor: { epoch: "old-epoch", sequence: 2 },
          kind: "snapshot",
          data: mode === "bulk" ? { $bulk: descriptor("stale-project", staleBytes) } : stale,
        },
      }),
    });
    await vi.waitFor(() =>
      mode === "bulk"
        ? expect(heldIo.has("stale-project")).toBe(true)
        : expect(staleGuard).toBeDefined(),
    );
    const resync = {
      jsonrpc: "2.0",
      method: "subscription.event",
      params: {
        ...first,
        cursor: { epoch: "old-epoch", sequence: 3 },
        kind: "resync-required",
        data: { reason: "deleted" },
      },
    };
    f.event("message", { generation: 0, text: JSON.stringify(resync) });
    f.emit({ ...resync, params: { ...resync.params, streamId: "wrong-stream" } });
    await Promise.resolve();
    expect(opens()).toHaveLength(1);
    f.emit(resync);
    await vi.waitFor(() => expect(opens()).toHaveLength(2));
    if (staleGuard) expect(staleGuard).toThrow();
    const nextId = opens()[1]!.params.subscriptionId as string;
    expect(nextId).not.toBe(firstId);
    expect(opens()[1]!.params).not.toHaveProperty("cursor");
    f.emit(resync); // An old control cannot create an unbounded restart loop.
    f.emit({
      jsonrpc: "2.0",
      method: "subscription.event",
      params: {
        subscriptionId: nextId,
        streamId: "stream-2",
        cursor: { epoch: "fresh-epoch", sequence: 1 },
        kind: "snapshot",
        data: { etag: "fresh", sessions: [] },
      },
    });
    await vi.waitFor(() => expect(applied).toEqual(["baseline", "fresh"]));
    expect(visible).toEqual([]);
    expect(opens()).toHaveLength(2);

    if (mode === "bulk") {
      // Invalidating delivery does not pretend the native descriptor read has finished.
      const firstProbe = lease.request("projects.list");
      await vi.waitFor(() => expect(heldIo.has("probe-1")).toBe(true));
      await expect(lease.request("projects.list")).rejects.toMatchObject({ category: "overload" });
      expect(f.native.readBulk).toHaveBeenCalledTimes(2);
      heldIo.get("probe-1")!({ dataBase64: probeBytes.toString("base64") });
      expect(await firstProbe).toEqual([]);
      heldIo.get("stale-project")!({ dataBase64: staleBytes.toString("base64") });
    } else releaseCommit();
    await vi.waitFor(() =>
      expect(f.native.acknowledge).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        10_001,
      ),
    );
    await vi.waitFor(() => {
      const acks = f.sent.filter((request) => request.method === "subscriptions.ack");
      expect(acks).toHaveLength(2);
      expect(acks.map((request) => request.params)).toEqual([
        { subscriptionId: firstId, cursor: { epoch: "old-epoch", sequence: 1 } },
        { subscriptionId: nextId, cursor: { epoch: "fresh-epoch", sequence: 1 } },
      ]);
    });
    expect(applied).toEqual(["baseline", "fresh"]);
    expect(visible).toEqual([]);
    expect(errors).toEqual([]);
    expect(f.native.open).toHaveBeenCalledTimes(1);
    expect(f.native.close).not.toHaveBeenCalled();
    expect(f.sent.some((request) => request.method === "commands.dispatch")).toBe(false);
  },
);
