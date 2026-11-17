import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from "expo-audio";
import { MicrophonePermissionError } from "../assistant/assistant-voice";
import { requestDevicePermission } from "./permission-flow";

/** Capture requests the OS in place; only a permanent denial offers Settings in the UI. */
export async function requireMicrophonePermission() {
  const permission = await requestDevicePermission(
    getRecordingPermissionsAsync,
    requestRecordingPermissionsAsync,
    async () => {},
  );
  if (permission.granted) return;
  if (!permission.canAskAgain) throw new MicrophonePermissionError();
  throw new Error("Microphone access was not granted. Tap the microphone to try again.");
}
