import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { HOST_RPC_METHODS } from "../../../src/shared/model/host-contracts";

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
