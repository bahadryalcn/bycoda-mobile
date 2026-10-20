import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const mocks = vi.hoisted(() => ({
  settings: vi.fn(), cameraRead: vi.fn(), cameraRequest: vi.fn(),
  channel: vi.fn(), notificationRead: vi.fn(), notificationRequest: vi.fn(), schedule: vi.fn(), handler: vi.fn(),
}));
vi.mock("react-native", () => ({ Linking: { openSettings: mocks.settings } }));
vi.mock("expo-camera", () => ({ Camera: { getCameraPermissionsAsync: mocks.cameraRead, requestCameraPermissionsAsync: mocks.cameraRequest } }));
vi.mock("expo-notifications", () => ({
  setNotificationChannelAsync: mocks.channel, getPermissionsAsync: mocks.notificationRead,
  requestPermissionsAsync: mocks.notificationRequest, scheduleNotificationAsync: mocks.schedule,
  setNotificationHandler: mocks.handler, AndroidImportance: { DEFAULT: 3 },
  AndroidNotificationVisibility: { PRIVATE: 0 }, IosAuthorizationStatus: { PROVISIONAL: 3, EPHEMERAL: 4 },
  SchedulableTriggerInputTypes: { TIME_INTERVAL: "timeInterval" },
}));
import { allowDevicePermission, testDeviceNotification } from "./device-permissions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("EXPO_OS", "android");
  mocks.cameraRead.mockResolvedValue({ granted: false, canAskAgain: true, status: "undetermined" });
  mocks.notificationRead.mockResolvedValue({ granted: false, canAskAgain: true, status: "undetermined" });
  mocks.cameraRequest.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
  mocks.notificationRequest.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
});
describe("native device permission integration", () => {
  it("keeps image picker from removing the scanner permission during native generation", () => {
    const { expo } = JSON.parse(readFileSync(new URL("../../../app.json", import.meta.url), "utf8"));
    const picker = expo.plugins.find((entry: unknown) => Array.isArray(entry) && entry[0] === "expo-image-picker");
    expect(picker[1].cameraPermission).toEqual(expect.any(String));
    expect(expo.android.blockedPermissions).not.toContain("android.permission.CAMERA");
    expect(expo.plugins.some((entry: unknown) => Array.isArray(entry) && entry[0] === "expo-notifications")).toBe(true);
  });
  it("uses the installed camera API and requests permission without opening Settings", async () => {
    await allowDevicePermission("camera");
    expect(mocks.cameraRequest).toHaveBeenCalledOnce();
    expect(mocks.settings).not.toHaveBeenCalled();
  });
  it("creates an Android channel before requesting notification permission", async () => {
    await allowDevicePermission("notifications");
    expect(mocks.channel).toHaveBeenCalledWith("bycoda", expect.objectContaining({ lockscreenVisibility: 0 }));
    expect(mocks.channel.mock.invocationCallOrder[0]).toBeLessThan(mocks.notificationRequest.mock.invocationCallOrder[0]);
    expect(mocks.settings).not.toHaveBeenCalled();
  });
  it("does not schedule a test when notification permission is denied", async () => {
    await expect(testDeviceNotification("bycoda", "test")).rejects.toThrow();
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
  it("schedules a generic local test after permission is granted", async () => {
    mocks.notificationRead.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    await testDeviceNotification("bycoda", "test");
    expect(mocks.schedule).toHaveBeenCalledWith(expect.objectContaining({ trigger: { type: "timeInterval", seconds: 3, channelId: "bycoda" } }));
  });
});
