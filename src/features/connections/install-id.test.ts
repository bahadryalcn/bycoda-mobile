import { afterEach, expect, it, vi } from "vitest";
import { deviceInstallId, parseDeviceInstallId } from "../../../../src/integrations/device-proof";
import { phoneInstallId } from "./install-id";

const getAndroidId = vi.hoisted(() => vi.fn<() => string>());
vi.mock("expo-application", () => ({ getAndroidId }));

afterEach(() => {
  vi.unstubAllEnvs();
  getAndroidId.mockReset();
});

it("hashes the Android ID with the computer's ID, so the raw value never leaves the phone", () => {
  vi.stubEnv("EXPO_OS", "android");
  getAndroidId.mockReturnValue("dd96dec43fb81c97");
  const id = phoneInstallId("env-a");
  expect(id).toBe(deviceInstallId("dd96dec43fb81c97", "env-a"));
  expect(parseDeviceInstallId(id)).toBe(id);
  expect(id).not.toContain("dd96dec43fb81c97");
  // Another computer sees an unrelated value; the same computer sees the same one after a reinstall.
  expect(phoneInstallId("env-b")).not.toBe(id);
  expect(phoneInstallId("env-a")).toBe(id);
});

it("sends nothing on iOS and the web, or when the identifier cannot be read", () => {
  getAndroidId.mockReturnValue("dd96dec43fb81c97");
  vi.stubEnv("EXPO_OS", "ios");
  expect(phoneInstallId("env-a")).toBeNull();
  vi.stubEnv("EXPO_OS", "web");
  expect(phoneInstallId("env-a")).toBeNull();
  vi.stubEnv("EXPO_OS", "android");
  getAndroidId.mockReturnValue("");
  expect(phoneInstallId("env-a")).toBeNull();
  getAndroidId.mockImplementation(() => {
    throw new Error("unavailable");
  });
  expect(phoneInstallId("env-a")).toBeNull();
});
