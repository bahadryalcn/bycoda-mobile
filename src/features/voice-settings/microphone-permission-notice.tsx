import { Linking } from "react-native";
import { Notice } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { MicrophonePermissionError } from "../assistant/assistant-voice";

/** Only permanent denial uses this error; retryable refusal keeps the microphone action available. */
export const isMicrophoneDenied = (error: unknown) => error instanceof MicrophonePermissionError;

/** Explains a denied microphone and opens the system Settings page for the app. */
export function MicrophonePermissionNotice() {
  const copy = useCopy();
  return <Notice tone="warning"
    message={copy("Mikrofon izni kapalı. Ayarlardan bycoda'ya mikrofon izni ver.", "Microphone access is off. Allow it for bycoda in Settings.")}
    action={{ label: copy("Ayarları aç", "Open Settings"), onPress: () => { Linking.openSettings().catch(() => {}); } }} />;
}
