import { afterEach, describe, expect, it, vi } from "vitest";
import { HostWsError, MobileHostWsConnection } from "./ws-connection";
import { binding, fakeNative } from "./ws-connection.test-fixture";
import {
  InboundRpcResponseSchema,
  InboundSubscriptionEventSchema,
  utf8WithinLimit,
} from "./ws-frames";
import { WS_LIMITS } from "../../../src/shared/model/host-contracts";

vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digest: async () => new ArrayBuffer(32),
}));

const encoder = new TextEncoder();
const exactWithin = (text: string, limit: number) => encoder.encode(text).length <= limit;

describe("utf8WithinLimit matches the encoded byte length without encoding", () => {
  const samples = [
    "",
    "a".repeat(40),
    "é".repeat(40),
    "€".repeat(40),
    "😀".repeat(40),
    "a😀é€".repeat(10),
    "\ud800".repeat(40),
    "x\udc00y".repeat(10),
    "😀\ud83d",
  ];
  it("agrees with TextEncoder at, below and above every boundary", () => {
    for (const text of samples) {
      const bytes = encoder.encode(text).length;
      for (const limit of [0, 1, bytes - 1, bytes, bytes + 1, text.length, text.length * 3])
        if (limit >= 0) expect(utf8WithinLimit(text, limit), `${JSON.stringify(text)} @${limit}`).toBe(
          exactWithin(text, limit),
        );
    }
  });
  it("rejects a frame whose UTF-16 length fits but whose UTF-8 bytes do not", () => {
    const limit = WS_LIMITS.maxMessageBytes;
    const text = "é".repeat(limit / 2 + 1);
    expect(text.length).toBeLessThanOrEqual(limit);
    expect(utf8WithinLimit(text, limit)).toBe(false);
    expect(utf8WithinLimit("é".repeat(limit / 2), limit)).toBe(true);
    expect(utf8WithinLimit("a".repeat(limit), limit)).toBe(true);
    expect(utf8WithinLimit("a".repeat(limit + 1), limit)).toBe(false);
  });
});

const eventFrame = (data: unknown) => ({
  jsonrpc: "2.0",
  method: "subscription.event",
  params: {
    subscriptionId: "subscription-a",
    streamId: "stream-a",
    cursor: { epoch: "epoch-a", sequence: 1 },
    kind: "snapshot",
    ...(data === undefined ? {} : { data }),
  },
});

describe("inbound frame envelopes keep identity rules and leave payloads to domain schemas", () => {
  it("passes event data through untouched, without rebuilding it", () => {
    const data = { session: { blocks: [{ id: "block-a" }] }, nested: [null, 1, "x"] };
    const parsed = InboundSubscriptionEventSchema.parse(eventFrame(data));
    expect(parsed.params.data).toBe(data);
    expect(InboundSubscriptionEventSchema.parse(eventFrame(undefined)).params).not.toHaveProperty(
      "data",
    );
  });
  it("still rejects bad identities, cursors, kinds and unknown keys on events", () => {
    const frame = eventFrame({});
    for (const bad of [
      { ...frame, jsonrpc: "1.0" },
      { ...frame, method: "other" },
      { ...frame, extra: true },
      { ...frame, params: { ...frame.params, subscriptionId: "bad id" } },
      { ...frame, params: { ...frame.params, streamId: "" } },
      { ...frame, params: { ...frame.params, cursor: { epoch: "e", sequence: -1 } } },
      { ...frame, params: { ...frame.params, kind: "other" } },
      { ...frame, params: { ...frame.params, extra: 1 } },
    ])
      expect(InboundSubscriptionEventSchema.safeParse(bad).success).toBe(false);
  });
  it("keeps result opaque but required, and still validates ids and structured errors", () => {
    const result = { rows: [1, 2, 3] };
    expect(InboundRpcResponseSchema.parse({ jsonrpc: "2.0", id: "r-1", result })).toMatchObject({
      result,
    });
    expect(
      InboundRpcResponseSchema.safeParse({ jsonrpc: "2.0", id: "r-1", result: null }).success,
    ).toBe(true);
    for (const bad of [
      { jsonrpc: "2.0", id: "r-1" },
      { jsonrpc: "2.0", id: "bad id", result },
      { jsonrpc: "2.0", id: "r-1", result, extra: true },
      { jsonrpc: "2.0", id: "r-1", error: { code: 1.5, message: "x" } },
      { jsonrpc: "2.0", id: "r-1", result, error: { code: 1, message: "x" } },
    ])
      expect(InboundRpcResponseSchema.safeParse(bad).success).toBe(false);
    expect(
      InboundRpcResponseSchema.safeParse({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32000, message: "x", data: { category: "overload" } },
      }).success,
    ).toBe(true);
  });
});

const connections: MobileHostWsConnection[] = [];
afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
});

describe("native frame size limit on the connection", () => {
  async function connect() {
    const failures: HostWsError[] = [];
    const f = fakeNative();
    const credential = await f.native.acquireCredential(binding);
    const connection = new MobileHostWsConnection(
      f.native,
      binding,
      credential,
      1,
      "app-a",
      async () => false,
      (error) => failures.push(error),
    );
    connections.push(connection);
    await connection.start();
    return { ...f, connection, failures };
  }
  it("fails an over-limit multibyte frame as overload even though its UTF-16 length fits", async () => {
    const f = await connect();
    f.event("message", {
      text: "é".repeat(WS_LIMITS.maxMessageBytes / 2 + 1),
      sequence: 1,
    });
    await vi.waitFor(() => expect(f.failures.map((error) => error.category)).toEqual(["overload"]));
  });
  it("drops a within-limit frame that is not JSON without failing the connection", async () => {
    const f = await connect();
    f.event("message", { text: "é".repeat(WS_LIMITS.maxMessageBytes / 2), sequence: 1 });
    await vi.waitFor(() => expect(f.connection.droppedFrames).toBe(1));
    expect(f.failures).toEqual([]);
  });
});
