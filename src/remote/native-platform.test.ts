import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { HOST_RPC_METHODS, WS_LIMITS } from "../../../src/shared/model/host-contracts";

const native = vi.hoisted(() => ({
  fetch: vi.fn<typeof fetch>(),
  random: vi.fn<(size: number) => Promise<Uint8Array>>(),
  insecureSyncFallback: vi.fn(),
}));
vi.mock("expo/fetch", () => ({ fetch: native.fetch }));
vi.mock("expo-crypto", () => ({
  getRandomBytesAsync: native.random,
  getRandomBytes: native.insecureSyncFallback,
}));

import { nativeHostFetch } from "./native-fetch.native";
import { nativeRandomBytes } from "./native-random.native";
import { nativeRandomBytes as portableRandomBytes } from "./native-random";

describe("native transport module boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Source-level ingress evidence only: this does not compile or run Kotlin/Swift.
  it.each([
    [
      "Android",
      "android/src/main/java/expo/modules/bycodahostsocket/BycodaHostSocketModule.kt",
      "connection.socket?.send(text)",
    ],
    ["iOS", "ios/BycodaHostSocketModule.swift", "connection.task.send(.string(text))"],
  ])(
    "keeps both %s raw socket private namespace denials before the actual send",
    async (_platform, path, sendExpression) => {
      const source = await readFile(
        new URL(`../../modules/bycoda-host-socket/${path}`, import.meta.url),
        "utf8",
      );
      const begin = source.indexOf('AsyncFunction("send")');
      const end = source.indexOf('AsyncFunction("acknowledge")', begin);
      expect(begin).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(begin);
      const body = source.slice(begin, end);
      const guard =
        /method\.(?:startsWith|hasPrefix)\("([^"]+)"\)\s*\|\|\s*method\.(?:startsWith|hasPrefix)\("([^"]+)"\)[^\n]*throw[^\n]*\("native_profile_required"\)/.exec(
          body,
        );
      expect(guard).not.toBeNull();
      expect(body.indexOf('"method"')).toBeLessThan(guard!.index);
      expect(body.indexOf(sendExpression)).toBeGreaterThan(guard!.index);
      const prefixes = [guard![1], guard![2]];
      const methods = Object.keys(HOST_RPC_METHODS).filter(
        (method) => method.startsWith("native.") || method.startsWith("devServers.bridge"),
      );
      for (const method of [...methods, "native.future.operation", "devServers.bridgeFuture"])
        expect(prefixes.some((prefix) => method.startsWith(prefix))).toBe(true);
      for (const method of [
        "workspaces.cleanup.plan",
        "workspaces.cleanup.apply",
        "workspaces.cleanup.status",
        "commands.dispatch",
        "devServers.list",
        "devServers.start",
      ])
        expect(prefixes.some((prefix) => method.startsWith(prefix))).toBe(false);
    },
  );

  // Source-level evidence only: this does not compile or run Kotlin/Swift (issue #1406).
  it.each([
    [
      "Android",
      "android/src/main/java/expo/modules/bycodahostsocket/BycodaHostSocketModule.kt",
      "synchronized(lock)",
      "sendLock.withLock",
      "JSONObject(text)",
      "text.toByteArray(Charsets.UTF_8)",
    ],
    [
      "iOS",
      "ios/BycodaHostSocketModule.swift",
      "try self.sync",
      "sendQueue.async",
      "JSONSerialization.jsonObject",
      "text.utf8.count",
    ],
  ])(
    "parses %s outgoing frames outside the lock shared with incoming messages",
    async (_platform, path, lock, ordering, parse, sizeScan) => {
      const source = await readFile(
        new URL(`../../modules/bycoda-host-socket/${path}`, import.meta.url),
        "utf8",
      );
      const begin = source.indexOf('AsyncFunction("send")');
      const body = source.slice(begin, source.indexOf('AsyncFunction("acknowledge")', begin));
      const orderingAt = body.indexOf(ordering);
      const parseAt = body.indexOf(parse);
      const commitAt = body.lastIndexOf(lock);
      // The first lock only admits; per-connection ordering starts before the parse, which precedes the commit lock.
      expect(orderingAt).toBeGreaterThan(body.indexOf(lock));
      expect(parseAt).toBeGreaterThan(orderingAt);
      expect(commitAt).toBeGreaterThan(parseAt);
      expect(body.split(parse)).toHaveLength(2);
      expect(body.split(sizeScan)).toHaveLength(2);
      // Admission, error precedence and the unchanged ordering of checks stay under the commit lock.
      const commit = body.slice(commitAt);
      const order = ["stale_connection", '"overload"', "voice_scope_denied", "native_profile_required"];
      const positions = order.map((code) => commit.indexOf(code));
      expect(positions.every((position) => position >= 0)).toBe(true);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    },
  );

  // Source-level evidence only: this does not compile or run Swift or reach a device (issue #1077).
  it("keeps the iOS WebSocket idle timer longer than the Host heartbeat without loosening the handshake deadline", async () => {
    const source = await readFile(
      new URL("../../modules/bycoda-host-socket/ios/BycodaHostSocketModule.swift", import.meta.url),
      "utf8",
    );
    const idle = /private let hostSocketIdleTimeout: TimeInterval = (\d+)\b/.exec(source);
    expect(idle).not.toBeNull();
    // A quiet healthy socket hears from the Host only every heartbeat interval, and a ping can lag by its response window.
    expect(Number(idle![1]) * 1000).toBeGreaterThanOrEqual(
      WS_LIMITS.heartbeatIntervalMs + WS_LIMITS.heartbeatResponseTimeoutMs,
    );
    const begin = source.indexOf("private func openPeer(");
    const body = source.slice(begin, source.indexOf("public func definition()", begin));
    expect(begin).toBeGreaterThanOrEqual(0);
    // The session's request timeout is the idle window; no literal can shrink it back to the connect budget.
    expect(body).toMatch(/config\.timeoutIntervalForRequest = hostSocketIdleTimeout\b/);
    expect(body).not.toMatch(/config\.timeoutIntervalForRequest = \d/);
    // Connect/upgrade stays bounded by its own deadline, and the pinned delegate, credential and cancellation path are unchanged.
    expect(body).toMatch(/asyncAfter\(deadline: \.now\(\) \+ \d[\d.]*\)[\s\S]*?self\.ended\(id, generation, "deadline", true\)/);
    expect(body).toContain("try SocketDelegate(owner: self, id: id, generation: generation, binding: credential.binding)");
    expect(body).toContain('request.setValue("Bearer \\(token)", forHTTPHeaderField: "Authorization")');
    expect(body.match(/hostSocketIdleTimeout/g)).toHaveLength(1);
  });

  it("forwards redirect, credential, and cancellation options to Expo without replacing the response", async () => {
    const controller = new AbortController();
    const response = new Response("hello");
    native.fetch.mockResolvedValueOnce(response);
    const options: RequestInit = {
      method: "GET",
      signal: controller.signal,
      redirect: "error",
      credentials: "omit",
    };
    expect(await nativeHostFetch("http://127.0.0.1/mobile/lan/hello", options)).toBe(response);
    expect(native.fetch).toHaveBeenCalledExactlyOnceWith(
      "http://127.0.0.1/mobile/lan/hello",
      options,
    );
  });

  it("propagates native cancellation instead of retrying it in the adapter", async () => {
    const aborted = new Error("Synthetic abort");
    native.fetch.mockRejectedValueOnce(aborted);
    await expect(nativeHostFetch("http://127.0.0.1/mobile/lan/hello")).rejects.toBe(aborted);
    expect(native.fetch).toHaveBeenCalledOnce();
  });

  it.each([nativeRandomBytes, portableRandomBytes])(
    "obtains fresh secure bytes for every call",
    async (randomBytes) => {
      native.random.mockImplementation(async (size) => new Uint8Array(size));
      const first = await randomBytes(32);
      const second = await randomBytes(32);
      expect(first).toHaveLength(32);
      expect(second).toHaveLength(32);
      expect(first).not.toBe(second);
      expect(native.random).toHaveBeenCalledTimes(2);
      expect(native.insecureSyncFallback).not.toHaveBeenCalled();
    },
  );

  it("propagates secure-random failure without falling back to development randomness", async () => {
    const unavailable = new Error("Synthetic secure random unavailable");
    native.random.mockRejectedValueOnce(unavailable);
    await expect(nativeRandomBytes(32)).rejects.toBe(unavailable);
    expect(native.insecureSyncFallback).not.toHaveBeenCalled();
  });
});
