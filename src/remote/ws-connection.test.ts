import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { HostWsError, MobileHostWsConnection } from "./ws-connection";
import { binding, fakeNative } from "./ws-connection.test-fixture";
import {
  HOST_RPC_METHODS,
  RPC_ERROR_CODES,
  WS_LIMITS,
} from "../../../src/shared/model/host-contracts";
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digest: async (_algorithm: string, bytes: Uint8Array) => {
    const out = createHash("sha256").update(bytes).digest();
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  },
}));
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
  it("reads handed-off session summaries without rejecting provider history", async () => {
    const f = await connected(undefined, {
      methods: ["sessions.list", "projects.list"],
      capabilities: ["transport.ws.read.v2", "transport.ws.sessions.v2"],
    });
    const session = {
      id: "session-a",
      projectId: "project-a",
      title: "Provider handoff",
      harness: "claude",
      status: "idle",
      revision: 1,
      updatedAt: 1,
      providerHistory: {
        providers: ["codex", "claude"],
        activeHarness: "claude",
        activeModel: "claude-model",
        handedOffFrom: "codex",
      },
    };
    f.respond((request) => (request.method === "sessions.list" ? [session] : []));
    await expect(
      f.connection.request("sessions.list", { projectId: "project-a" }),
    ).resolves.toEqual([session]);
    await expect(f.connection.request("projects.list")).resolves.toEqual([]);
    expect(f.native.close).not.toHaveBeenCalled();
  });
  it.each([
    [RPC_ERROR_CODES.deadlineExceeded, "deadline"],
    [RPC_ERROR_CODES.cancelled, "cancelled"],
    [RPC_ERROR_CODES.notReady, "unavailable"],
    [RPC_ERROR_CODES.internalError, "internal"],
    [RPC_ERROR_CODES.overloaded, "overload"],
    [RPC_ERROR_CODES.methodNotFound, "unsupported"],
    [RPC_ERROR_CODES.invalidParams, "validation"],
    [RPC_ERROR_CODES.unauthorized, "authentication"],
    [RPC_ERROR_CODES.wrongEnvironment, "identity"],
  ] as const)(
    "retains RPC error %s as %s without closing a healthy socket",
    async (code, category) => {
      const f = await connected();
      const result = f.connection.request("projects.list");
      const rejected = expect(result).rejects.toMatchObject({ category, uncertain: false });
      f.emit({
        jsonrpc: "2.0",
        id: f.sent.at(-1)!.id,
        error: { code, message: "Host read failed." },
      });
      await rejected;
      expect(f.native.close).not.toHaveBeenCalled();
      f.respond(() => []);
      await expect(f.connection.request("projects.list")).resolves.toEqual([]);
    },
  );
  it("sizes outbound frames by exact UTF-8 bytes, not UTF-16 length", async () => {
    const f = await connected();
    const sentBefore = f.sent.length;
    // Fits: 262144 × 2 bytes plus envelope is under the 1 MiB frame cap.
    const fits = f.connection.request("commands.dispatch", {
      type: "send",
      commandId: "command-a",
      sessionId: "session-a",
      text: "é".repeat(WS_LIMITS.maxMessageBytes / 4),
    });
    fits.catch(() => undefined);
    await vi.waitFor(() => expect(f.sent).toHaveLength(sentBefore + 1));
    // Over: 524289 UTF-16 units (below the cap by length) encode to over 1 MiB, so nothing is sent.
    const over = f.connection.request("commands.dispatch", {
      type: "send",
      commandId: "command-b",
      sessionId: "session-a",
      text: "é".repeat(WS_LIMITS.maxMessageBytes / 2 + 1),
    });
    await expect(over).rejects.toMatchObject({ category: "overload" });
    expect(f.sent).toHaveLength(sentBefore + 1);
  });
  it("preserves typed temporary failure and unknown command delivery without replay", async () => {
    const f = await connected();
    const result = f.connection.request("commands.dispatch", {
      type: "send",
      commandId: "command-a",
      sessionId: "session-a",
      text: "hello",
    });
    const rejected = expect(result).rejects.toMatchObject({
      category: "unavailable",
      uncertain: true,
      commandId: "command-a",
    });
    f.emit({
      jsonrpc: "2.0",
      id: f.sent.at(-1)!.id,
      error: {
        code: RPC_ERROR_CODES.internalError,
        message: "Host read failed.",
        data: { category: "unavailable", retryable: false, delivery: "unknown" },
      },
    });
    await rejected;
    expect(f.sent.filter((request) => request.method === "commands.dispatch")).toHaveLength(1);
  });
  // After a Host restart the phone's status check read "connection interrupted, check the result":
  // a refusal the Host marks not-sent is a known outcome and keeps its stable code.
  it("keeps a Host refusal that ran nothing as a known outcome with its code", async () => {
    const f = await connected();
    const result = f.connection.request("commands.dispatch", { type: "send", commandId: "command-b", sessionId: "session-a", text: "hello" });
    const rejected = expect(result).rejects.toMatchObject({ category: "validation", uncertain: false, code: "CONTEXT_CHANGED" });
    f.emit({
      jsonrpc: "2.0",
      id: f.sent.at(-1)!.id,
      error: { code: RPC_ERROR_CODES.invalidParams, message: "The original Host instance changed.", data: { category: "conflict", retryable: false, delivery: "not-sent", code: "CONTEXT_CHANGED" } },
    });
    await rejected;
  });
  it("preserves native TLS failures for in-flight reads", async () => {
    const f = await connected();
    const result = f.connection.request("projects.list");
    const rejected = expect(result).rejects.toMatchObject({ category: "tls", uncertain: false });
    f.event("error", { code: "tls" });
    await rejected;
  });
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
    await expect(result).rejects.toMatchObject({ category: "identity", uncertain: false });
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
    // 48 in flight + 512 queued (the Host itself accepts 64 pending RPCs).
    const waiting = Array.from({ length: 48 + 512 }, () =>
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
  it("applies a burst without waiting for acks and coalesces them to the newest cursor", async () => {
    const applied: number[] = [];
    const f = await connected(async (event) => {
      applied.push(event.params.cursor.sequence);
      return true;
    });
    const realSend = vi.mocked(f.native.send).getMockImplementation()!;
    const acks: number[] = [];
    // Host never answers acks: a serialized pipeline would stall after the first event.
    vi.mocked(f.native.send).mockImplementation(async (id, generation, text) => {
      const request = JSON.parse(text) as { method: string; params: { cursor: { sequence: number } } };
      if (request.method === "subscriptions.ack") acks.push(request.params.cursor.sequence);
      else await realSend(id, generation, text);
    });
    for (let sequence = 1; sequence <= 5; sequence++)
      f.emit({
        jsonrpc: "2.0",
        method: "subscription.event",
        params: {
          subscriptionId: "subscription-a",
          streamId: "stream-a",
          cursor: { epoch: "epoch-a", sequence },
          kind: "snapshot",
          data: { sequence },
        },
      });
    await vi.waitFor(() => expect(applied).toEqual([1, 2, 3, 4, 5]));
    expect(acks).toEqual([1]);
  });
  describe("stream ack failures", () => {
    async function ackFixture(replyToAck: (request: { id: string; sequence: number; attempt: number }) => unknown) {
      const events: { kind: string; subscriptionId: string; streamId: string }[] = [];
      const failures: HostWsError[] = [];
      const f = fakeNative();
      const credential = await f.native.acquireCredential(binding);
      const connection = new MobileHostWsConnection(
        f.native,
        binding,
        credential,
        1,
        "app-a",
        async (event) => {
          events.push({
            kind: event.params.kind,
            subscriptionId: event.params.subscriptionId,
            streamId: event.params.streamId,
          });
          return event.params.kind !== "resync-required";
        },
        (error) => failures.push(error),
      );
      connections.push(connection);
      await connection.start();
      const attempts = new Map<number, number>();
      const realSend = vi.mocked(f.native.send).getMockImplementation()!;
      vi.mocked(f.native.send).mockImplementation(async (id, generation, text) => {
        const request = JSON.parse(text) as {
          id: string;
          method: string;
          params: { subscriptionId?: string; cursor?: { sequence: number } };
        };
        if (request.method === "subscriptions.open") {
          f.sent.push(request as never);
          queueMicrotask(() =>
            f.emit({
              jsonrpc: "2.0",
              id: request.id,
              result: { subscriptionId: request.params.subscriptionId, streamId: "stream-a" },
            }),
          );
          return;
        }
        if (request.method !== "subscriptions.ack") return realSend(id, generation, text);
        f.sent.push(request as never);
        const sequence = request.params.cursor!.sequence;
        const attempt = (attempts.get(sequence) ?? 0) + 1;
        attempts.set(sequence, attempt);
        const reply = replyToAck({ id: request.id, sequence, attempt });
        if (reply !== undefined)
          queueMicrotask(() => f.emit({ jsonrpc: "2.0", id: request.id, ...(reply as object) }));
      });
      await connection.request("subscriptions.open", {
        subscriptionId: "subscription-a",
        target: { kind: "session", sessionId: "session-a" },
      });
      const deliver = (sequence: number) =>
        f.emit({
          jsonrpc: "2.0",
          method: "subscription.event",
          params: {
            subscriptionId: "subscription-a",
            streamId: "stream-a",
            cursor: { epoch: "epoch-a", sequence },
            kind: "snapshot",
            data: { sequence },
          },
        });
      const acks = () => f.sent.filter((request) => request.method === "subscriptions.ack");
      return { f, connection, events, failures, deliver, acks };
    }
    const hostError = (code: number) => ({ error: { code, message: "Host ack failed." } });

    it("retries a busy ack with the newest cursor without closing the socket", async () => {
      vi.useFakeTimers();
      const x = await ackFixture(({ sequence, attempt }) =>
        sequence === 1 && attempt === 1 ? hostError(RPC_ERROR_CODES.overloaded) : { result: { accepted: true } },
      );
      x.deliver(1);
      // Flush only queued work: a fake-timer waitFor advances the clock and can fire the retry early.
      await vi.advanceTimersByTimeAsync(0);
      expect(x.acks()).toHaveLength(1);
      // A newer cursor arrives while the failed ack waits: it replaces the retry, never reorders.
      x.deliver(2);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(x.acks().map((ack) => (ack.params.cursor as { sequence: number }).sequence)).toEqual([1, 2]);
      expect(x.failures).toEqual([]);
      expect(x.f.native.close).not.toHaveBeenCalled();
      expect(x.events.filter((event) => event.kind === "resync-required")).toEqual([]);
    });
    it("restarts only the affected stream when acks keep timing out", async () => {
      vi.useFakeTimers();
      const x = await ackFixture(() => hostError(RPC_ERROR_CODES.deadlineExceeded));
      x.deliver(1);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(x.acks()).toHaveLength(4);
      expect(x.events.filter((event) => event.kind === "resync-required")).toEqual([
        { kind: "resync-required", subscriptionId: "subscription-a", streamId: "stream-a" },
      ]);
      expect(x.failures).toEqual([]);
      expect(x.f.native.close).not.toHaveBeenCalled();
      // The connection stays usable for other requests.
      x.f.respond(() => []);
      await expect(x.connection.request("projects.list")).resolves.toEqual([]);
    });
    it("restarts the stream, not the socket, when the Host refuses an ack", async () => {
      const x = await ackFixture(() => hostError(RPC_ERROR_CODES.internalError));
      x.deliver(1);
      await vi.waitFor(() =>
        expect(x.events.map((event) => event.kind)).toContain("resync-required"),
      );
      expect(x.acks()).toHaveLength(1);
      expect(x.failures).toEqual([]);
      expect(x.f.native.close).not.toHaveBeenCalled();
    });
    it.each([
      [RPC_ERROR_CODES.unauthorized, "authentication"],
      [RPC_ERROR_CODES.wrongEnvironment, "identity"],
      [RPC_ERROR_CODES.invalidRequest, "schema"],
    ] as const)("still closes the socket when an ack is rejected as %s", async (code, category) => {
      const x = await ackFixture(() => hostError(code));
      x.deliver(1);
      await vi.waitFor(() => expect(x.failures).toHaveLength(1));
      expect(x.failures[0]).toMatchObject({ category });
      expect(x.f.native.close).toHaveBeenCalled();
      expect(x.events.map((event) => event.kind)).not.toContain("resync-required");
    });
    it("closes the socket when an ack frame cannot cross the transport", async () => {
      const x = await ackFixture(() => undefined);
      vi.mocked(x.f.native.send).mockRejectedValueOnce(new Error("bridge down"));
      x.deliver(1);
      await vi.waitFor(() => expect(x.failures).toHaveLength(1));
      expect(x.failures[0]).toMatchObject({ category: "network" });
    });
  });
  it("drops one malformed frame instead of failing the connection", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failures: HostWsError[] = [];
    const f = fakeNative();
    const credential = await f.native.acquireCredential(binding);
    const connection = new MobileHostWsConnection(
      f.native, binding, credential, 1, "app-a", undefined, (error) => failures.push(error),
    );
    connections.push(connection);
    await connection.start();
    f.event("message", { text: "{not json", sequence: 90 });
    f.event("message", {
      text: JSON.stringify({ jsonrpc: "2.0", method: "subscription.event", params: { bogus: 1 } }),
      sequence: 91,
    });
    await vi.waitFor(() => expect(connection.droppedFrames).toBe(2));
    expect(failures).toEqual([]);
    expect(f.native.close).not.toHaveBeenCalled();
    f.respond(() => []);
    await expect(connection.request("projects.list")).resolves.toEqual([]);
    warn.mockRestore();
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

describe("native delivery credit", () => {
  it("releases bridge credit on receipt even while the frame's processing is still waiting", async () => {
    const apply = vi.fn(() => new Promise<void>(() => undefined));
    const f = await connected(apply as never);
    const before = vi.mocked(f.native.acknowledge).mock.calls.length;
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
    await vi.waitFor(() => expect(vi.mocked(f.native.acknowledge).mock.calls.length).toBe(before + 1));
  });
});

describe("request queue under the Host's pending-RPC limit", () => {
  it("queues requests beyond the in-flight cap instead of failing them as overload", async () => {
    const f = await connected();
    f.respond(() => undefined); // the Host holds every request open
    const sentBefore = f.sent.length;
    const results = Array.from({ length: 80 }, () =>
      f.connection.request("projects.list", {}).then(
        () => "ok",
        (error: HostWsError) => error.category,
      ),
    );
    await vi.waitFor(() => expect(f.sent.length - sentBefore).toBe(48));
    // Answer the in-flight ones; the queued ones are sent and answered in turn.
    f.respond(() => ({ projects: [] }));
    for (const request of f.sent.slice(sentBefore))
      f.emit({ jsonrpc: "2.0", id: request.id, result: { projects: [] } });
    await vi.waitFor(() => expect(f.sent.length - sentBefore).toBe(80));
    const settled = await Promise.all(results);
    expect(settled.filter((value) => value === "overload")).toHaveLength(0);
  });
  it("keeps stream controls under the Host's per-socket control limit without blocking reads", async () => {
    const f = await connected();
    f.respond(() => undefined); // the Host holds every request open
    const sentBefore = f.sent.length;
    for (let index = 0; index < 32; index++)
      void f.connection
        .request("subscriptions.open", {
          subscriptionId: `subscription-${index}`,
          target: { kind: "session", sessionId: `session-${index}` },
        })
        .catch(() => undefined);
    void f.connection.request("projects.list", {}).catch(() => undefined);
    await vi.waitFor(() => expect(f.sent.length - sentBefore).toBe(7));
    const sent = f.sent.slice(sentBefore);
    expect(sent.filter((request) => request.method === "subscriptions.open")).toHaveLength(6);
    // A read waiting behind queued controls is still sent.
    expect(sent.some((request) => request.method === "projects.list")).toBe(true);
    // Answering one open lets the next queued open go, in order.
    const first = sent.find((request) => request.method === "subscriptions.open")!;
    f.emit({
      jsonrpc: "2.0",
      id: first.id,
      result: { subscriptionId: "subscription-0", streamId: "stream-0" },
    });
    await vi.waitFor(() => expect(f.sent.length - sentBefore).toBe(8));
    expect(f.sent.at(-1)!.params).toMatchObject({ subscriptionId: "subscription-6" });
    f.connection.close();
  });
  it("drops a queued request when its caller aborts and rejects the queue on close", async () => {
    const f = await connected();
    f.respond(() => undefined);
    for (let index = 0; index < 48; index++)
      void f.connection.request("projects.list", {}).catch(() => undefined);
    const controller = new AbortController();
    const aborted = f.connection.request("projects.list", {}, { signal: controller.signal });
    const closed = f.connection.request("projects.list", {});
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ category: "cancelled" });
    f.connection.close();
    await expect(closed).rejects.toMatchObject({ category: "network" });
  });
});
