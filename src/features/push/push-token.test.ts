import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));

const rotationHandlers: (() => void)[] = [];
const getExpoPushTokenAsync = vi.fn<(options: { projectId: string }) => Promise<{ data: string }>>();
const api = {
  getExpoPushTokenAsync,
  addPushTokenListener: vi.fn((handler: () => void) => {
    rotationHandlers.push(handler);
    return { remove: vi.fn() };
  }),
};
vi.mock("../permissions/device-permissions", () => ({ notifications: vi.fn(async () => api) }));

/** The token state is per module, so each test starts from a fresh import like a new app run. */
async function load() {
  vi.resetModules();
  return import("./push-registration");
}

beforeEach(() => {
  rotationHandlers.length = 0;
  getExpoPushTokenAsync.mockReset();
  api.addPushTokenListener.mockClear();
  getExpoPushTokenAsync.mockResolvedValue({ data: "ExpoPushToken[a]" });
});

describe("expo push token", () => {
  it("contacts Expo once and reuses the token on later resumes", async () => {
    const { expoPushToken } = await load();
    await expect(expoPushToken("project")).resolves.toBe("ExpoPushToken[a]");
    await expect(expoPushToken("project")).resolves.toBe("ExpoPushToken[a]");
    await expect(expoPushToken("project")).resolves.toBe("ExpoPushToken[a]");
    expect(getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
    expect(api.addPushTokenListener).toHaveBeenCalledTimes(1);
  });

  it("shares one request between callers that start together", async () => {
    const { expoPushToken } = await load();
    const tokens = await Promise.all([expoPushToken("project"), expoPushToken("project")]);
    expect(tokens).toEqual(["ExpoPushToken[a]", "ExpoPushToken[a]"]);
    expect(getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed fetch, so the next call retries", async () => {
    const { expoPushToken } = await load();
    getExpoPushTokenAsync.mockRejectedValueOnce(new Error("offline"));
    await expect(expoPushToken("project")).rejects.toThrow("offline");
    await expect(expoPushToken("project")).resolves.toBe("ExpoPushToken[a]");
    expect(getExpoPushTokenAsync).toHaveBeenCalledTimes(2);
  });

  it("fetches again after the OS rotates the token and tells listeners", async () => {
    const { expoPushToken, onPushTokenRotated } = await load();
    const rotated = vi.fn();
    onPushTokenRotated(rotated);
    await expoPushToken("project");
    getExpoPushTokenAsync.mockResolvedValue({ data: "ExpoPushToken[b]" });
    rotationHandlers.forEach((handler) => handler());
    expect(rotated).toHaveBeenCalledTimes(1);
    await expect(expoPushToken("project")).resolves.toBe("ExpoPushToken[b]");
    expect(getExpoPushTokenAsync).toHaveBeenCalledTimes(2);
  });

  it("never caches a token whose fetch started before a rotation", async () => {
    const { expoPushToken } = await load();
    let finishStale: (value: { data: string }) => void = () => undefined;
    getExpoPushTokenAsync.mockReturnValueOnce(new Promise((resolve) => { finishStale = resolve; }));
    const stale = expoPushToken("project");
    await vi.waitFor(() => expect(getExpoPushTokenAsync).toHaveBeenCalledTimes(1));
    rotationHandlers.forEach((handler) => handler());
    getExpoPushTokenAsync.mockResolvedValue({ data: "ExpoPushToken[b]" });
    finishStale({ data: "ExpoPushToken[old]" });
    await stale;
    await expect(expoPushToken("project")).resolves.toBe("ExpoPushToken[b]");
  });

  it("fetches again when asked for a fresh token or another project", async () => {
    const { expoPushToken } = await load();
    await expoPushToken("project");
    await expoPushToken("project", { fresh: true });
    await expoPushToken("other");
    expect(getExpoPushTokenAsync.mock.calls.map(([options]) => options.projectId)).toEqual(["project", "project", "other"]);
  });

  it("stops notifying a listener that unsubscribed", async () => {
    const { expoPushToken, onPushTokenRotated } = await load();
    const rotated = vi.fn();
    onPushTokenRotated(rotated)();
    await expoPushToken("project");
    rotationHandlers.forEach((handler) => handler());
    expect(rotated).not.toHaveBeenCalled();
  });
});
