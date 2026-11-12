import { describe, expect, it, vi } from "vitest";
import { createMockAccountServer } from "../contracts/mock";
import { createAccountRuntime, DEVICE_HEADER, type DeviceIdStore } from "./account-runtime";
import { readAccountConfig } from "./config";
import { deviceRegistration, releaseChannel, type DeviceInfo } from "./device-registration";
import { syncPushToken } from "./push-sync";
import { activitySummaryQuery, splitMinutes } from "./activity-query";

const info: DeviceInfo = { name: "Pixel", platform: "android", osVersion: "Android 16", appVersion: "0.1.0", channel: "stable" };

function memoryStore(initial: string | null = null): DeviceIdStore & { value: string | null } {
  const store = {
    value: initial,
    read: async () => store.value,
    write: async (id: string) => void (store.value = id),
    clear: async () => void (store.value = null),
  };
  return store;
}

function setup(store = memoryStore()) {
  const server = createMockAccountServer();
  const seen: Headers[] = [];
  const onDeviceRevoked = vi.fn();
  const runtime = createAccountRuntime({
    baseUrl: "https://mock.bycoda.invalid",
    getToken: async () => "mock-token",
    fetch: (input, init) => {
      seen.push(new Headers(init?.headers));
      return server.fetch(input, init);
    },
    store,
    onDeviceRevoked,
  });
  return { server, runtime, store, seen, onDeviceRevoked };
}

describe("account runtime", () => {
  it("registers once, stores the id and sends it on later calls", async () => {
    const { runtime, store, seen } = setup();
    const device = await runtime.registerDevice((id) => deviceRegistration(info, id));
    expect(store.value).toBe(device.id);
    expect(seen[0]!.has(DEVICE_HEADER)).toBe(false);
    await runtime.client.getMe();
    expect(seen[1]!.get(DEVICE_HEADER)).toBe(device.id);
    const again = await runtime.registerDevice((id) => deviceRegistration(info, id));
    expect(again.id).toBe(device.id);
  });

  it("signs out locally and forgets the id on device_revoked, without throwing away the response", async () => {
    const { runtime, store, server, onDeviceRevoked } = setup(memoryStore("dev_old"));
    server.state.devices.set("dev_old", {
      id: "dev_old", name: "x", platform: "android", osVersion: "", appVersion: "", channel: "stable",
      kind: "mobile", createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(),
      revokedAt: new Date().toISOString(),
    });
    await expect(
      runtime.registerDevice((id) => deviceRegistration(info, id)),
    ).rejects.toMatchObject({ code: "device_revoked" });
    expect(onDeviceRevoked).toHaveBeenCalledOnce();
    expect(store.value).toBeNull();
  });

  it("releases the device on sign-out and clears the stored id even when offline", async () => {
    const { runtime, store } = setup();
    await runtime.registerDevice((id) => deviceRegistration(info, id));
    await runtime.releaseDevice();
    expect(store.value).toBeNull();
    const offline = createAccountRuntime({
      baseUrl: "https://mock.bycoda.invalid",
      getToken: async () => "mock-token",
      fetch: async () => {
        throw new TypeError("offline");
      },
      store: memoryStore("dev_1"),
      onDeviceRevoked: () => undefined,
    });
    await expect(offline.releaseDevice()).resolves.toBeUndefined();
  });
});

describe("push token sync", () => {
  it("sends a new or changed token once and skips an unchanged one", async () => {
    const { runtime, server } = setup();
    const device = await runtime.registerDevice((id) => deviceRegistration(info, id));
    let mark: string | null = null;
    const marks = { read: async () => mark, write: async (v: string) => void (mark = v), clear: async () => void (mark = null) };
    const args = { client: runtime.client, deviceId: device.id, marks };
    expect(await syncPushToken({ ...args, token: "ExponentPushToken[a]" })).toBe("registered");
    expect(server.state.pushTokens.get(device.id)).toBe("ExponentPushToken[a]");
    expect(await syncPushToken({ ...args, token: "ExponentPushToken[a]" })).toBe("unchanged");
    expect(await syncPushToken({ ...args, token: "ExponentPushToken[b]" })).toBe("registered");
    expect(server.state.pushTokens.get(device.id)).toBe("ExponentPushToken[b]");
  });
});

describe("registration, config and activity helpers", () => {
  it("builds a valid mobile registration and trims long values", () => {
    const body = deviceRegistration({ ...info, name: "p".repeat(200) }, "dev_1");
    expect(body).toMatchObject({ deviceId: "dev_1", kind: "mobile", platform: "android" });
    expect(body.name).toHaveLength(80);
    expect("deviceId" in deviceRegistration(info, null)).toBe(false);
    expect(releaseChannel(true, undefined)).toBe("dev");
    expect(releaseChannel(false, "preview")).toBe("preview");
    expect(releaseChannel(false, undefined)).toBe("stable");
  });

  it("has no built-in API url and reads the mock flag", () => {
    expect(readAccountConfig({})).toEqual({ publishableKey: "", apiUrl: "", mock: false });
    expect(readAccountConfig({ EXPO_PUBLIC_BYCODA_API_URL: "http://x.test/", EXPO_PUBLIC_ACCOUNT_MOCK: "1" })).toMatchObject({
      apiUrl: "http://x.test",
      mock: true,
    });
  });

  it("derives the summary query and splits minutes", async () => {
    expect(activitySummaryQuery(new Date("2026-11-08T23:30:00Z"), "Asia/Tokyo")).toEqual({ timeZone: "Asia/Tokyo", date: "2026-11-09" });
    expect(splitMinutes(125)).toEqual({ hours: 2, minutes: 5 });
    expect(splitMinutes(-3)).toEqual({ hours: 0, minutes: 0 });
  });
});
