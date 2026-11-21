import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const mocks = vi.hoisted(() => ({
  settings: vi.fn(), cameraRead: vi.fn(), cameraRequest: vi.fn(), microphoneRead: vi.fn(), microphoneRequest: vi.fn(),
  channel: vi.fn(), notificationRead: vi.fn(), notificationRequest: vi.fn(), schedule: vi.fn(), handler: vi.fn(),
}));
vi.mock("react-native", () => ({ Linking: { openSettings: mocks.settings } }));
vi.mock("expo-camera", () => ({ Camera: { getCameraPermissionsAsync: mocks.cameraRead, requestCameraPermissionsAsync: mocks.cameraRequest } }));
vi.mock("expo-audio", () => ({ getRecordingPermissionsAsync: mocks.microphoneRead, requestRecordingPermissionsAsync: mocks.microphoneRequest }));
vi.mock("expo-notifications", () => ({
  setNotificationChannelAsync: mocks.channel, getPermissionsAsync: mocks.notificationRead,
  requestPermissionsAsync: mocks.notificationRequest, scheduleNotificationAsync: mocks.schedule,
  setNotificationHandler: mocks.handler, AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  AndroidNotificationVisibility: { PRIVATE: 0 }, IosAuthorizationStatus: { PROVISIONAL: 3, EPHEMERAL: 4 },
  SchedulableTriggerInputTypes: { TIME_INTERVAL: "timeInterval" },
}));
import { allowDevicePermission, readDevicePermission, testDeviceNotification, useNotificationPermissionRevision } from "./device-permissions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("EXPO_OS", "android");
  mocks.cameraRead.mockResolvedValue({ granted: false, canAskAgain: true, status: "undetermined" });
  mocks.microphoneRead.mockResolvedValue({ granted: false, canAskAgain: true, status: "undetermined" });
  mocks.microphoneRequest.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
  mocks.notificationRead.mockResolvedValue({ granted: false, canAskAgain: true, status: "undetermined" });
  mocks.cameraRequest.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
  mocks.notificationRequest.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
});
describe("native device permission integration", () => {
  it.each(["microphone", "camera"] as const)("requests retryable %s denial instead of opening Settings", async kind => {
    const read = kind === "camera" ? mocks.cameraRead : mocks.microphoneRead;
    const request = kind === "camera" ? mocks.cameraRequest : mocks.microphoneRequest;
    read.mockResolvedValue({ granted: false, canAskAgain: true, status: "denied" });
    await allowDevicePermission(kind);
    expect(request).toHaveBeenCalledOnce();
    expect(mocks.settings).not.toHaveBeenCalled();
  });
  it("opens Settings for a permanently blocked camera", async () => {
    mocks.cameraRead.mockResolvedValue({ granted: false, canAskAgain: false, status: "denied" });
    mocks.cameraRequest.mockResolvedValueOnce({ granted: false, canAskAgain: false, status: "denied" });
    await allowDevicePermission("camera");
    expect(mocks.settings).toHaveBeenCalledOnce();
    expect(mocks.cameraRequest).toHaveBeenCalledOnce();
  });
  it("requests microphone permission through audio without starting recording or opening settings", async () => {
    await allowDevicePermission("microphone");
    expect(mocks.microphoneRead).toHaveBeenCalledOnce();
    expect(mocks.microphoneRequest).toHaveBeenCalledOnce();
    expect(mocks.notificationRequest).not.toHaveBeenCalled();
    expect(mocks.settings).not.toHaveBeenCalled();
  });
  it("offers system settings once the OS confirms a permanent microphone denial", async () => {
    mocks.microphoneRead.mockResolvedValue({ granted: false, canAskAgain: false, status: "denied" });
    mocks.microphoneRequest.mockResolvedValueOnce({ granted: false, canAskAgain: false, status: "denied" });
    await allowDevicePermission("microphone");
    expect(mocks.microphoneRequest).toHaveBeenCalledOnce();
    expect(mocks.settings).toHaveBeenCalledOnce();
  });
  it("keeps image picker from removing the microphone permission during native generation", () => {
    const { expo } = JSON.parse(readFileSync(new URL("../../../app.json", import.meta.url), "utf8"));
    const picker = expo.plugins.find((entry: unknown) => Array.isArray(entry) && entry[0] === "expo-image-picker");
    expect(picker[1].microphonePermission).toEqual(expect.any(String));
    expect(expo.android.blockedPermissions).not.toContain("android.permission.RECORD_AUDIO");
  });
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
  it("invalidates notification registration after the native prompt answers without requiring a resume", async () => {
    const before = useNotificationPermissionRevision.getState().revision;
    await readDevicePermission("notifications");
    await allowDevicePermission("camera");
    expect(useNotificationPermissionRevision.getState().revision).toBe(before);

    await allowDevicePermission("notifications");
    expect(useNotificationPermissionRevision.getState().revision).toBe(before + 1);
  });
  it("schedules a generic local test after permission is granted", async () => {
    mocks.notificationRead.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    await testDeviceNotification("bycoda", "test");
    expect(mocks.schedule).toHaveBeenCalledWith(expect.objectContaining({ trigger: { type: "timeInterval", seconds: 3, channelId: "bycoda" } }));
  });
});
