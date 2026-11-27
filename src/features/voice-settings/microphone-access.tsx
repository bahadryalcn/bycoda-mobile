import { useCallback, useEffect, useState } from "react";
import { AppState, Linking } from "react-native";
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from "expo-audio";
import { useCopy } from "@/ui/copy";
import { Button, StatusText, ValueRow } from "@/ui/primitives";

export type MicrophoneAccess = "checking" | "granted" | "not-asked" | "denied" | "unknown";

/** The permission read, bounded so a status that never settles reads as unknown instead of a silent row. */
export async function readMicrophoneAccess(
  read: () => Promise<{ granted: boolean; canAskAgain: boolean; status?: string }> = getRecordingPermissionsAsync,
  timeoutMs = 4000,
): Promise<MicrophoneAccess> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      read(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), timeoutMs); }),
    ]);
    if (result.granted) return "granted";
    return result.canAskAgain ? "not-asked" : "denied";
  } catch {
    return "unknown";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Settings → Voice and microphone → Microphone access, as on the desktop. Granted (and checking) is a
 * plain value; otherwise the row names its one action: ask while the phone still may, open the system
 * Settings after a denial, or check again. The state is read again on return.
 */
export function MicrophoneAccessRow() {
  const copy = useCopy();
  const [access, setAccess] = useState<MicrophoneAccess>("checking");
  const refresh = useCallback(() => { void readMicrophoneAccess().then(setAccess); }, []);
  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") refresh(); });
    return () => subscription.remove();
  }, [refresh]);
  const value = access === "granted" ? copy("İzin verildi", "Granted")
    : access === "not-asked" ? copy("Sorulmadı", "Not asked")
    : access === "denied" ? copy("Reddedildi", "Denied")
    : access === "unknown" ? copy("Okunamadı", "Unavailable")
    : copy("Denetleniyor…", "Checking…");
  const action = access === "not-asked"
    ? { label: copy("İzin iste", "Ask for access"), onPress: () => { void requestRecordingPermissionsAsync().catch(() => undefined).finally(refresh); } }
    : access === "denied" ? { label: copy("Ayarları aç", "Open Settings"), onPress: () => { void Linking.openSettings().catch(() => undefined); } }
    : access === "unknown" ? { label: copy("Yeniden dene", "Retry"), onPress: refresh }
    : undefined;
  return (
    <ValueRow label={copy("Mikrofon erişimi", "Microphone access")} value={action ? undefined : value}
      trailing={action ? <>
        <StatusText label={value} tone={access === "denied" ? "warning" : "default"} />
        <Button label={action.label} tone="quiet" density="compact" onPress={action.onPress} />
      </> : undefined} />
  );
}
