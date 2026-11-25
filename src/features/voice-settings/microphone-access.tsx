import { useCallback, useEffect, useState } from "react";
import { AppState, Linking } from "react-native";
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from "expo-audio";
import { useCopy } from "@/ui/copy";
import { NavigationRow, StatusText } from "@/ui/primitives";

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
 * Settings → Voice assistant → Microphone → Microphone access, as on the desktop. A tap asks when the
 * phone still may; after a denial it opens the system settings. The state is read again on return.
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
  return (
    // A command with its current state as the trailing value (no navigation chevron): granted is the
    // quiet normal case, a denial is a warning the owner acts on.
    <NavigationRow
      label={copy("Mikrofon erişimi", "Microphone access")}
      accessibilityLabel={`${copy("Mikrofon erişimi", "Microphone access")}: ${value}`}
      intent="command"
      trailing={<StatusText label={value} tone={access === "denied" ? "warning" : "default"} />}
      busy={access === "checking"}
      onPress={() => {
        if (access === "not-asked") void requestRecordingPermissionsAsync().catch(() => undefined).finally(refresh);
        else if (access === "unknown") refresh();
        else void Linking.openSettings().catch(() => undefined);
      }}
    />
  );
}
