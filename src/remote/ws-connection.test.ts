import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { HostWsError, MobileHostWsConnection } from "./ws-connection";
import { binding, fakeNative } from "./ws-connection.test-fixture";
import { HOST_RPC_METHODS } from "../../../src/shared/model/host-contracts";
const connections: MobileHostWsConnection[] = [];
async function connected(
  apply?: ConstructorParameters<typeof MobileHostWsConnection>[5],
  hello?: Parameters<typeof fakeNative>[0],
) {
  const f = fakeNative(hello);
  const credential = await f.native.acquireCredential(binding);
  const connection = new MobileHostWsConnection(f.native, binding, credential, 1, "app-a", apply);
  connections.push(connection);
  await connection.start();
  return { ...f, connection };
}
afterEach(() => {
  for (const c of connections.splice(0)) c.close();
  vi.useRealTimers();
});

describe("mobile single-attempt native WS", () => {
  it("does not expose private Native or bridge operations even when hello advertises every registered method", async () => {
    const methods = Object.keys(HOST_RPC_METHODS).filter(
      (method) => method.startsWith("native.") || method.startsWith("devServers.bridge"),
    );
    const cleanup = [
      "workspaces.cleanup.plan",
      "workspaces.cleanup.apply",
      "workspaces.cleanup.status",
    ];
    const f = await connected(undefined, {
      methods: [...methods, ...cleanup, "devServers.list"],
      capabilities: [
        "native.buffers.recovery.v1",
        "native.workspaces.v1",
        "native.buffers.upload.v1",
        "transport.ws.v2",
        "transport.ws.workspaces.cleanup.v1",
        "transport.ws.devServers.v2",
      ],
    });
    for (const method of [...methods, "native.future.operation", "devServers.bridgeFuture"]) {
      expect(f.connection.supports(method)).toBe(false);
      await expect(f.connection.request(method, {})).rejects.toMatchObject({
        category: "schema",
        uncertain: false,
      });
    }
    for (const method of cleanup) expect(f.connection.supports(method)).toBe(true);
    expect(f.connection.supports("devServers.list")).toBe(true);
    expect(f.sent).toHaveLength(1);
  });
  it("requires both the canonical capability and the negotiated method before sending", async () => {
    const missingRoute = await connected(undefined, { methods: [] });
    expect(missingRoute.connection.supports("projects.list")).toBe(false);
    await expect(missingRoute.connection.request("projects.list")).rejects.toMatchObject({
      category: "schema",
      uncertain: false,
    });
    expect(missingRoute.sent).toHaveLength(1);
    const missingCapability = await connected(undefined, { capabilities: ["transport.ws.v2"] });
    expect(missingCapability.connection.supports("projects.list")).toBe(false);
    await expect(missingCapability.connection.request("projects.list")).rejects.toMatchObject({
      category: "schema",
      uncertain: false,
    });
    expect(missingCapability.sent).toHaveLength(1);
  });
  it.each(["closed", "resync-required"] as const)(
    "fences an initial snapshot when matched %s precedes the open reply",
    async (kind) => {
      let opening!: Promise<unknown>,
        removed = false,
        writes = 0;
      const f = await connected(async (event, assertCurrent) => {
        await opening;
        if (event.params.kind === kind) {
          removed = true;
          return true;
        }
        assertCurrent();
        writes++;
        return true;
      });
      opening = f.connection.request("subscriptions.open", {
        subscriptionId: "subscription-a",
        target: { kind: "session", sessionId: "session-a" },
      });
      const openId = f.sent.at(-1)!.id;
      const params = {
        subscriptionId: "subscription-a",
        streamId: "stream-a",
        cursor: { epoch: "epoch-a", sequence: 1 },
      };
      f.emit({
        jsonrpc: "2.0",
        method: "subscription.event",
        params: { ...params, kind: "snapshot", data: {} },
      });
      f.emit({
        jsonrpc: "2.0",
        method: "subscription.event",
        params: {
          ...params,
          kind,
          cursor: { epoch: "epoch-a", sequence: 2 },
          data: { reason: "deleted" },
        },
      });
      f.emit({
        jsonrpc: "2.0",
        id: openId,
        result: { subscriptionId: "subscription-a", streamId: "stream-a" },
      });
      await opening;
      await vi.waitFor(() => expect(f.native.acknowledge).toHaveBeenCalledTimes(4));
      expect(removed).toBe(true);
      expect(writes).toBe(0);
      expect(f.sent.filter((request) => request.method === "subscriptions.ack")).toHaveLength(0);
      expect(f.native.close).not.toHaveBeenCalled();
    },
  );
  it("delivers a matching tombstone ahead of stalled bulk without applying or ACKing old data", async () => {
    let removed = false,
      writes = 0;
    const f = await connected(async (event, assertCurrent) => {
      if (event.params.kind === "closed") {
        removed = true;
        return true;
      }
      assertCurrent();
      writes++;
      return true;
    });
    f.respond((request) =>
      request.method === "subscriptions.open"
        ? { subscriptionId: request.params.subscriptionId, streamId: "stream-a" }
        : undefined,
    );
    await f.connection.request("subscriptions.open", {
      subscriptionId: "subscription-a",
      target: { kind: "session", sessionId: "session-a" },
    });
    let release!: (value: { dataBase64: string }) => void;
    vi.mocked(f.native.readBulk).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const bytes = Buffer.from(JSON.stringify({ value: "old snapshot" }));
    const descriptor = {
      kind: "bulk",
      transferId: "transfer-a",
      environmentId: binding.environmentId,
      totalBytes: bytes.length,
      chunkBytes: 65_536,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      expiresAt: Date.now() + 30_000,
    };
    const params = {
      subscriptionId: "subscription-a",
      streamId: "stream-a",
      cursor: { epoch: "epoch-a", sequence: 1 },
    };
    f.emit({
      jsonrpc: "2.0",
      method: "subscription.event",
      params: { ...params, kind: "snapshot", data: { $bulk: descriptor } },
    });
    await vi.waitFor(() => expect(f.native.readBulk).toHaveBeenCalledTimes(1));
    f.emit({
      jsonrpc: "2.0",
      method: "subscription.event",
      params: { ...params, streamId: "wrong-stream", kind: "closed", data: { reason: "deleted" } },
    });
    await Promise.resolve();
    expect(removed).toBe(false);
    f.emit({
      jsonrpc: "2.0",
      method: "subscription.event",
      params: {
        ...params,
        cursor: { epoch: "epoch-a", sequence: 2 },
        kind: "closed",
        data: { reason: "deleted" },
      },
    });
    await vi.waitFor(() => expect(removed).toBe(true));
    expect(writes).toBe(0);
    release({ dataBase64: bytes.toString("base64") });
    await vi.waitFor(() => expect(f.native.acknowledge).toHaveBeenCalledTimes(5));
    expect(writes).toBe(0);
    expect(f.sent.filter((request) => request.method === "subscriptions.ack")).toHaveLength(0);
    expect(f.native.close).not.toHaveBeenCalled();
  });
  it("invalidates a stalled commit's guard before delivering its terminal callback", async () => {
    let guard!: () => void, release!: () => void;
    let removed = false,
      writes = 0;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = await connected(async (event, assertCurrent) => {
      if (event.params.kind === "closed") {
        expect(() => guard()).toThrow();
        removed = true;
        return true;
      }
      guard = assertCurrent;
      await blocked;
      assertCurrent();
      writes++;
      return true;
    });
    f.respond((request) =>
      request.method === "subscriptions.open"
        ? { subscriptionId: request.params.subscriptionId, streamId: "stream-a" }
        : [],
    );
    await f.connection.request("subscriptions.open", {
      subscriptionId: "subscription-a",
      target: { kind: "session", sessionId: "session-a" },
    });
    const params = {
      subscriptionId: "subscription-a",
      streamId: "stream-a",
      cursor: { epoch: "epoch-a", sequence: 1 },
    };
    f.emit({
      jsonrpc: "2.0",
      method: "subscription.event",
      params: { ...params, kind: "snapshot", data: {} },
    });
    await vi.waitFor(() => expect(guard).toBeDefined());
    f.emit({
      jsonrpc: "2.0",
      method: "subscription.event",
      params: {
        ...params,
        cursor: { epoch: "epoch-a", sequence: 2 },
        kind: "closed",
        data: { reason: "deleted" },
      },
    });
    await vi.waitFor(() => expect(removed).toBe(true));
    release();
    await vi.waitFor(() => expect(f.native.acknowledge).toHaveBeenCalledTimes(4));
    expect(writes).toBe(0);
    expect(f.sent.filter((request) => request.method === "subscriptions.ack")).toHaveLength(0);
    expect(await f.connection.request("projects.list")).toEqual([]);
    expect(f.native.close).not.toHaveBeenCalled();
  });
  it("never reads a JavaScript credential and correlates the hello-bound response", async () => {
    const f = await connected();
    const projects = [{ id: "project-a", cwd: "/project", name: "Project" }];
    f.respond(() => projects);
    expect(await f.connection.request("projects.list")).toEqual(projects);
    expect(JSON.stringify(f.sent)).not.toContain("Bearer");
    expect(f.native.open).toHaveBeenCalledExactlyOnceWith("opaque-handle", "mobile:app-a:1", 1);
    expect(f.native.acknowledge).toHaveBeenCalled();
  });
  it("omits optional undefined object fields at the JSON adapter boundary", async () => {
    const f = await connected();
    f.respond(() => []);
    expect(await f.connection.request("projects.list", { omitted: undefined })).toEqual([]);
    expect(f.sent.at(-1)?.params).toEqual({});
    await expect(async () =>
      f.connection.request("projects.list", { invalid: () => undefined }),
    ).rejects.toMatchObject({ category: "schema" });
  });
  it("holds an interrupted command under its same identity and never replays it", async () => {
    const f = await connected();
    const result = f.connection.request("commands.dispatch", {
      type: "cancel",
      commandId: "command-a",
      sessionId: "session-a",
      runId: "run-a",
    });
    f.event("error", { code: "network" });
    await expect(result).rejects.toMatchObject({
      uncertain: true,
      commandId: "command-a",
      category: "network",
    });
    expect(f.sent.filter((r) => r.method === "commands.dispatch")).toHaveLength(1);
    expect(f.native.open).toHaveBeenCalledTimes(1);
  });
  it("rejects stale generation frames and blocks a current wrong environment", async () => {
    const f = await connected();
    const result = f.connection.request("projects.list");
    f.event("message", {
      generation: 0,
      text: JSON.stringify({ jsonrpc: "2.0", id: f.sent.at(-1)!.id, result: [] }),
    });
    f.event("message", { environmentId: "environment-b", text: "{}" });
    await expect(result).rejects.toMatchObject({ category: "network", uncertain: false });
    expect(f.native.close).toHaveBeenCalled();
  });
  it("limits pending requests and cancellation stops waiting without sending Stop", async () => {
    const f = await connected();
    const abort = new AbortController();
    const command = f.connection.request(
      "commands.dispatch",
      { type: "send", commandId: "command-a", sessionId: "session-a", text: "hello" },
      { signal: abort.signal },
    );
    abort.abort();
    await expect(command).rejects.toMatchObject({ uncertain: true, category: "cancelled" });
    expect(f.sent.at(-1)?.method).toBe("requests.cancel");
    const waiting = Array.from({ length: 64 }, () =>
      f.connection.request("projects.list").catch((error) => error),
    );
    await expect(f.connection.request("projects.list")).rejects.toMatchObject({
      category: "overload",
    });
    f.connection.close();
    await Promise.all(waiting);
    expect(f.sent.filter((r) => r.method === "commands.dispatch")).toHaveLength(1);
  });
  it("acknowledges a stream only after the app commits, independently of bridge credits", async () => {
    let commit!: (applied: boolean) => void;
    const applied = new Promise<boolean>((resolve) => {
      commit = resolve;
    });
    const f = await connected(async () => applied);
    f.emit({
      jsonrpc: "2.0",
      method: "subscription.event",
      params: {
        subscriptionId: "subscription-a",
        streamId: "stream-a",
        cursor: { epoch: "epoch-a", sequence: 1 },
        kind: "snapshot",
        data: { ok: true },
      },
    });
    await Promise.resolve();
    expect(f.sent.filter((r) => r.method === "subscriptions.ack")).toHaveLength(0);
    commit(true);
    await vi.waitFor(() =>
      expect(f.sent.filter((r) => r.method === "subscriptions.ack")).toHaveLength(1),
    );
  });
  it("hydrates protected bulk bytes, checks their full hash, then validates the domain result", async () => {
    const f = await connected();
    const bytes = Buffer.from(
      JSON.stringify([{ id: "project-a", cwd: "/project", name: "Türkçe 😀" }]),
    );
    const descriptor = {
      kind: "bulk",
      transferId: "transfer-a",
      environmentId: binding.environmentId,
      totalBytes: bytes.length,
      chunkBytes: 16,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      expiresAt: Date.now() + 20_000,
    };
    f.respond(() => ({ $bulk: descriptor }));
    vi.mocked(f.native.readBulk).mockImplementation(async (_handle, _descriptor, offset) => ({
      dataBase64: bytes.subarray(offset, offset + descriptor.chunkBytes).toString("base64"),
    }));
    expect(await f.connection.request("projects.list")).toEqual(JSON.parse(bytes.toString()));
    expect(f.native.readBulk).toHaveBeenCalledTimes(Math.ceil(bytes.length / 16));
    f.respond(() => ({ $bulk: { ...descriptor, sha256: "0".repeat(64) } }));
    await expect(f.connection.request("projects.list")).rejects.toBeInstanceOf(HostWsError);
  });
});
