import { beforeEach, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ read: vi.fn(), request: vi.fn() }));
vi.mock("expo-audio", () => ({ getRecordingPermissionsAsync: native.read, requestRecordingPermissionsAsync: native.request }));
import { requireMicrophonePermission } from "./microphone-permission";
import { MicrophonePermissionError } from "../assistant/assistant-voice";
import { inactiveFromSystemPrompt } from "@/state/system-prompt";

beforeEach(() => { vi.clearAllMocks(); inactiveFromSystemPrompt("active"); });
it.each(["undetermined", "denied"])("requests a %s microphone when the OS allows asking", async status => {
  native.read.mockResolvedValue({ granted: false, status, canAskAgain: true });
  native.request.mockImplementation(async () => {
    expect(inactiveFromSystemPrompt("inactive")).toBe(true);
    return { granted: true, status: "granted", canAskAgain: true };
  });
  await requireMicrophonePermission();
  expect(native.request).toHaveBeenCalledOnce();
});
it("reserves Settings recovery for permanent denial", async () => {
  native.read.mockResolvedValue({ granted: false, status: "denied", canAskAgain: false });
  await expect(requireMicrophonePermission()).rejects.toBeInstanceOf(MicrophonePermissionError);
  expect(native.request).not.toHaveBeenCalled();
});
it("keeps retryable denial out of the Settings notice", async () => {
  native.read.mockResolvedValue({ granted: false, status: "undetermined", canAskAgain: true });
  native.request.mockResolvedValue({ granted: false, status: "denied", canAskAgain: true });
  const error = await requireMicrophonePermission().catch(cause => cause);
  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(MicrophonePermissionError);
});
it("does not request again after a grant", async () => {
  native.read.mockResolvedValue({ granted: true, status: "granted", canAskAgain: true });
  await requireMicrophonePermission();
  expect(native.request).not.toHaveBeenCalled();
});
