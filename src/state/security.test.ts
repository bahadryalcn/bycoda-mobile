import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  preference: null as string | null,
  config: null as string | null,
  level: 1,
  foreground: "active",
  authenticate: vi.fn(),
  write: vi.fn(),
  read: vi.fn(),
  subscriptions: new Set<(state: string) => void>(),
}));
vi.mock("react-native", () => ({
  AppState: {
    get currentState() {
      return fixture.foreground;
    },
    addEventListener: (_event: string, callback: (state: string) => void) => {
      fixture.subscriptions.add(callback);
      return { remove: () => fixture.subscriptions.delete(callback) };
    },
  },
}));
vi.mock("expo-local-authentication", () => ({
  SecurityLevel: { SECRET: 1 },
  getEnrolledLevelAsync: async () => fixture.level,
  authenticateAsync: fixture.authenticate,
}));
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device-only",
  getItemAsync: fixture.read,
  setItemAsync: fixture.write,
}));
import { assertAppAccess, useSecurity } from "./security";
import {
  encodeSecurityPreferences,
  securityPreferenceKey,
} from "./security-preferences";

beforeEach(() => {
  fixture.foreground = "active";
  fixture.preference = null;
  fixture.config = null;
  fixture.level = 1;
  fixture.authenticate.mockReset().mockResolvedValue({ success: true });
  fixture.read
    .mockReset()
    .mockImplementation(async (key) =>
      key === securityPreferenceKey ? fixture.config : fixture.preference,
    );
  fixture.write.mockReset().mockImplementation(async (key, value) => {
    if (key === securityPreferenceKey) fixture.config = value;
    else fixture.preference = value;
  });
  useSecurity.getState().lock();
  useSecurity.setState({
    status: "loading",
    enabled: false,
    autoLockTimeoutMs: 0,
    available: false,
    busy: false,
    appState: "active",
    windowFocused: true,
    error: null,
  });
});
afterEach(() => vi.restoreAllMocks());

describe("native secure access", () => {
  it("defaults to locked on secured devices and gates requests before authentication", async () => {
    expect(() => assertAppAccess()).toThrow("Unlock");
    await useSecurity.getState().initialize();
    expect(useSecurity.getState()).toMatchObject({
      enabled: true,
      status: "locked",
    });
    expect(JSON.parse(fixture.config!)).toEqual({
      version: 2,
      enabled: true,
      autoLockTimeoutMs: 0,
    });
    await useSecurity.getState().unlock("Unlock Bycoda");
    expect(() => assertAppAccess()).not.toThrow();
    expect(fixture.authenticate).toHaveBeenCalledWith(
      expect.objectContaining({
        biometricsSecurityLevel: "strong",
        disableDeviceFallback: false,
      }),
    );
  });
  it("requires authentication again after backgrounding", async () => {
    await useSecurity.getState().initialize();
    await useSecurity.getState().unlock("Unlock");
    useSecurity.getState().handleAppState("background");
    expect(() => assertAppAccess()).toThrow();
    useSecurity.getState().handleAppState("active");
    fixture.authenticate.mockResolvedValue({
      success: false,
      error: "user_cancel",
    });
    await useSecurity.getState().unlock("Unlock");
    expect(useSecurity.getState()).toMatchObject({
      status: "locked",
      error: "cancelled",
    });
  });
  it("rejects stale authentication when explicitly locked during the prompt", async () => {
    await useSecurity.getState().initialize();
    let answer!: (value: { success: boolean }) => void;
    fixture.authenticate.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const unlock = useSecurity.getState().unlock("Unlock");
    await vi.waitFor(() => expect(answer).toBeTypeOf("function"));
    useSecurity.getState().lock();
    answer({ success: true });
    await unlock;
    expect(useSecurity.getState().status).toBe("locked");
  });
  it("does not unlock from a successful result while the app remains backgrounded", async () => {
    await useSecurity.getState().initialize();
    fixture.foreground = "background";
    await useSecurity.getState().unlock("Unlock");
    expect(useSecurity.getState()).toMatchObject({
      status: "locked",
      error: "background",
    });
  });
  it("never silently disables an existing lock when device authentication is removed", async () => {
    fixture.preference = "on";
    fixture.level = 0;
    await useSecurity.getState().initialize();
    await useSecurity.getState().unlock("Unlock");
    expect(useSecurity.getState()).toMatchObject({
      enabled: true,
      status: "locked",
      error: "not-secured",
    });
    expect(fixture.authenticate).not.toHaveBeenCalled();
  });
  it("leaves a failed secure preference read locked and supports retry", async () => {
    fixture.read.mockRejectedValueOnce(new Error("storage unavailable"));
    await useSecurity.getState().initialize();
    expect(useSecurity.getState()).toMatchObject({
      status: "locked",
      error: "storage",
    });
    await useSecurity.getState().unlock("Unlock");
    expect(fixture.authenticate).not.toHaveBeenCalled();
    await useSecurity.getState().initialize();
    await useSecurity.getState().unlock("Unlock");
    expect(useSecurity.getState().status).toBe("unlocked");
  });
  it("requires owner authentication to disable the lock and preserves it if saving fails", async () => {
    await useSecurity.getState().initialize();
    await useSecurity.getState().unlock("Unlock");
    fixture.authenticate.mockResolvedValueOnce({
      success: false,
      error: "user_cancel",
    });
    await useSecurity.getState().setEnabled(false, "Change secure access");
    expect(JSON.parse(fixture.config!).enabled).toBe(true);
    fixture.write.mockRejectedValueOnce(new Error("disk error"));
    await useSecurity.getState().setEnabled(false, "Change secure access");
    expect(useSecurity.getState().enabled).toBe(true);
    await useSecurity.getState().setEnabled(false, "Change secure access");
    expect(JSON.parse(fixture.config!).enabled).toBe(false);
    expect(useSecurity.getState().enabled).toBe(false);
  });
  it("keeps a successful PIN result locked until the native window returns focus", async () => {
    await useSecurity.getState().initialize();
    let answer!: (value: { success: boolean }) => void;
    fixture.authenticate.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const unlock = useSecurity.getState().unlock("Unlock");
    await vi.waitFor(() => expect(answer).toBeTypeOf("function"));
    useSecurity.getState().handleWindowFocus(false);
    answer({ success: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(useSecurity.getState()).toMatchObject({
      status: "locked",
      busy: true,
    });
    expect(() => assertAppAccess()).toThrow();
    useSecurity.getState().handleWindowFocus(true);
    await unlock;
    expect(useSecurity.getState()).toMatchObject({
      status: "unlocked",
      busy: false,
    });
  });
  it("supports another focused authentication after an unlocked workspace backgrounds", async () => {
    await useSecurity.getState().initialize();
    await useSecurity.getState().unlock("Unlock");
    fixture.foreground = "background";
    useSecurity.getState().handleAppState("background");
    expect(() => assertAppAccess()).toThrow();
    fixture.foreground = "active";
    useSecurity.getState().handleAppState("active");
    let answer!: (value: { success: boolean }) => void;
    fixture.authenticate.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const unlock = useSecurity.getState().unlock("Unlock again");
    await vi.waitFor(() => expect(answer).toBeTypeOf("function"));
    useSecurity.getState().handleWindowFocus(false);
    answer({ success: true });
    await Promise.resolve();
    useSecurity.getState().handleWindowFocus(true);
    await unlock;
    expect(() => assertAppAccess()).not.toThrow();
    expect(fixture.authenticate).toHaveBeenCalledTimes(2);
  });
  it("rejects success when focus is lost again before the authentication commit", async () => {
    await useSecurity.getState().initialize();
    useSecurity.getState().handleWindowFocus(false);
    const unlock = useSecurity.getState().unlock("Unlock");
    await Promise.resolve();
    await Promise.resolve();
    useSecurity.getState().handleWindowFocus(true);
    useSecurity.getState().handleWindowFocus(false);
    await unlock;
    expect(useSecurity.getState()).toMatchObject({
      status: "locked",
      error: "background",
      busy: false,
    });
  });
  it("keeps quick settings and a backgrounded preference write locked after focus returns", async () => {
    await useSecurity.getState().initialize();
    await useSecurity.getState().unlock("Unlock");
    useSecurity.getState().handleWindowFocus(false);
    useSecurity.getState().handleWindowFocus(true);
    expect(() => assertAppAccess()).toThrow();
    await useSecurity.getState().unlock("Unlock again");
    let finishWrite!: () => void;
    fixture.write.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = resolve;
        }),
    );
    const change = useSecurity
      .getState()
      .setEnabled(false, "Change secure access");
    await vi.waitFor(() => expect(finishWrite).toBeTypeOf("function"));
    fixture.foreground = "background";
    useSecurity.getState().handleAppState("background");
    fixture.foreground = "active";
    useSecurity.getState().handleAppState("active");
    useSecurity.getState().handleWindowFocus(true);
    finishWrite();
    await change;
    expect(useSecurity.getState()).toMatchObject({
      status: "locked",
      busy: false,
    });
    expect(() => assertAppAccess()).toThrow();
  });
});

describe("configurable background app lock", () => {
  async function openWithGrace(
    timeoutMs: 30_000 | 60_000 | 300_000 | 900_000 = 30_000,
  ) {
    fixture.config = encodeSecurityPreferences({
      enabled: true,
      autoLockTimeoutMs: timeoutMs,
    });
    await useSecurity.getState().initialize();
    expect(useSecurity.getState().status).toBe("locked");
    await useSecurity.getState().unlock("Unlock");
  }
  function clocks() {
    let elapsed = 0;
    vi.spyOn(Date, "now").mockImplementation(() => 1_000_000 + elapsed);
    vi.spyOn(performance, "now").mockImplementation(() => 10_000 + elapsed);
    return (value: number) => {
      elapsed = value;
    };
  }
  function background() {
    fixture.foreground = "background";
    useSecurity.getState().handleAppState("background");
  }
  function resume() {
    fixture.foreground = "active";
    useSecurity.getState().handleAppState("active");
  }

  it.each(["on", "off"])(
    "migrates legacy %s without changing its enabled preference",
    async (value) => {
      fixture.preference = value;
      await useSecurity.getState().initialize();
      expect(useSecurity.getState()).toMatchObject({
        enabled: value === "on",
        autoLockTimeoutMs: 0,
        status: value === "on" ? "locked" : "unlocked",
      });
      expect(JSON.parse(fixture.config!)).toEqual({
        version: 2,
        enabled: value === "on",
        autoLockTimeoutMs: 0,
      });
      expect(fixture.preference).toBe(value);
    },
  );

  it("covers and blocks host access immediately, then resumes before the grace boundary", async () => {
    await openWithGrace();
    const advance = clocks();
    background();
    expect(useSecurity.getState().status).toBe("suspended");
    expect(() => assertAppAccess()).toThrow();
    advance(29_999);
    resume();
    expect(() => assertAppAccess()).not.toThrow();
    expect(fixture.authenticate).toHaveBeenCalledTimes(1);
  });

  it("blocks access as soon as native foreground is lost even before its lifecycle handler runs", async () => {
    await openWithGrace();
    fixture.foreground = "background";
    expect(useSecurity.getState().status).toBe("unlocked");
    expect(() => assertAppAccess()).toThrow();
  });

  it("requires fresh authentication at the exact timeout boundary", async () => {
    await openWithGrace();
    const advance = clocks();
    background();
    advance(30_000);
    resume();
    expect(useSecurity.getState().status).toBe("locked");
    expect(() => assertAppAccess()).toThrow();
    await useSecurity.getState().unlock("Unlock again");
    expect(fixture.authenticate).toHaveBeenCalledTimes(2);
    expect(() => assertAppAccess()).not.toThrow();
  });

  it("does not extend grace with repeated background or focus events", async () => {
    await openWithGrace();
    const advance = clocks();
    background();
    advance(20_000);
    useSecurity.getState().handleWindowFocus(false);
    useSecurity.getState().handleAppState("inactive");
    useSecurity.getState().handleAppState("background");
    advance(30_000);
    useSecurity.getState().handleWindowFocus(true);
    expect(useSecurity.getState().status).toBe("suspended");
    resume();
    expect(useSecurity.getState().status).toBe("locked");
  });

  it("waits for both active app state and native focus before restoring grace", async () => {
    await openWithGrace();
    const advance = clocks();
    useSecurity.getState().handleWindowFocus(false);
    background();
    advance(1_000);
    resume();
    expect(() => assertAppAccess()).toThrow();
    useSecurity.getState().handleWindowFocus(true);
    expect(() => assertAppAccess()).not.toThrow();
    expect(fixture.authenticate).toHaveBeenCalledTimes(1);
  });

  it("does not apply background grace to manual locking or a fresh launch", async () => {
    await openWithGrace(900_000);
    clocks();
    background();
    useSecurity.getState().lock();
    resume();
    expect(useSecurity.getState().status).toBe("locked");
    await useSecurity.getState().unlock("Unlock again");
    await useSecurity.getState().initialize();
    expect(useSecurity.getState().status).toBe("locked");
    expect(() => assertAppAccess()).toThrow();
  });

  it("fails closed after a device clock reversal during grace", async () => {
    await openWithGrace();
    const advance = clocks();
    background();
    advance(-1_000);
    resume();
    expect(useSecurity.getState().status).toBe("locked");
  });

  it("authenticates and persists the timeout atomically with the enabled preference", async () => {
    await useSecurity.getState().initialize();
    await useSecurity.getState().unlock("Unlock");
    await useSecurity.getState().setAutoLockTimeout(300_000, "Change timeout");
    expect(fixture.authenticate).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fixture.config!)).toEqual({
      version: 2,
      enabled: true,
      autoLockTimeoutMs: 300_000,
    });
    await useSecurity.getState().initialize();
    expect(useSecurity.getState()).toMatchObject({
      status: "locked",
      autoLockTimeoutMs: 300_000,
    });
  });

  it("preserves the previous timeout after cancelled authentication or a storage failure", async () => {
    await openWithGrace();
    fixture.authenticate.mockResolvedValueOnce({
      success: false,
      error: "user_cancel",
    });
    await useSecurity.getState().setAutoLockTimeout(900_000, "Change timeout");
    expect(useSecurity.getState()).toMatchObject({
      autoLockTimeoutMs: 30_000,
      error: "cancelled",
    });
    fixture.write.mockRejectedValueOnce(new Error("disk error"));
    await useSecurity.getState().setAutoLockTimeout(900_000, "Change timeout");
    expect(useSecurity.getState()).toMatchObject({
      autoLockTimeoutMs: 30_000,
      error: "storage",
      busy: false,
    });
    expect(JSON.parse(fixture.config!).autoLockTimeoutMs).toBe(30_000);
  });

  it("rejects a stale timeout authentication without writing or restoring access", async () => {
    await openWithGrace();
    fixture.write.mockClear();
    let answer!: (value: { success: boolean }) => void;
    fixture.authenticate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const change = useSecurity
      .getState()
      .setAutoLockTimeout(900_000, "Change timeout");
    await vi.waitFor(() => expect(answer).toBeTypeOf("function"));
    useSecurity.getState().lock();
    answer({ success: true });
    await change;
    expect(fixture.write).not.toHaveBeenCalled();
    expect(useSecurity.getState()).toMatchObject({
      status: "locked",
      autoLockTimeoutMs: 30_000,
      busy: false,
    });
  });

  it("never restores an interrupted settings authentication through background grace", async () => {
    await openWithGrace();
    clocks();
    let answer!: (value: { success: boolean; error: string }) => void;
    fixture.authenticate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const change = useSecurity
      .getState()
      .setAutoLockTimeout(900_000, "Change timeout");
    await vi.waitFor(() => expect(answer).toBeTypeOf("function"));
    useSecurity.getState().handleWindowFocus(false);
    expect(useSecurity.getState().status).toBe("locked");
    answer({ success: false, error: "user_cancel" });
    useSecurity.getState().handleWindowFocus(true);
    await change;
    expect(useSecurity.getState()).toMatchObject({
      status: "locked",
      autoLockTimeoutMs: 30_000,
      busy: false,
    });
    expect(() => assertAppAccess()).toThrow();
  });

  it("keeps a backgrounded timeout write locked and prevents overlapping secure writes", async () => {
    await openWithGrace();
    let finishWrite!: () => void;
    fixture.write.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = resolve;
        }),
    );
    const change = useSecurity
      .getState()
      .setAutoLockTimeout(60_000, "Change timeout");
    await vi.waitFor(() => expect(finishWrite).toBeTypeOf("function"));
    const writes = fixture.write.mock.calls.length;
    await useSecurity.getState().setEnabled(false, "Disable");
    await useSecurity.getState().setAutoLockTimeout(900_000, "Change again");
    await useSecurity.getState().initialize();
    expect(fixture.write).toHaveBeenCalledTimes(writes);
    background();
    resume();
    finishWrite();
    await change;
    expect(useSecurity.getState()).toMatchObject({
      status: "locked",
      autoLockTimeoutMs: 60_000,
      busy: false,
    });
    expect(() => assertAppAccess()).toThrow();
  });

  it.each([
    "bad JSON",
    '{"version":2,"enabled":false,"autoLockTimeoutMs":-1}',
    '{"version":2,"enabled":"false","autoLockTimeoutMs":30000}',
  ])(
    "locks on corrupt v2 preferences instead of using legacy off: %s",
    async (config) => {
      fixture.config = config;
      fixture.preference = "off";
      await useSecurity.getState().initialize();
      expect(useSecurity.getState()).toMatchObject({
        status: "locked",
        enabled: true,
        error: "storage",
      });
      expect(fixture.write).not.toHaveBeenCalled();
    },
  );
});
