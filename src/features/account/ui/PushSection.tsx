import { useEffect, useMemo, useState } from "react";
import { AppState, Linking } from "react-native";
import { NavigationGroup, NavigationRow, SettingIcon, StatusText } from "@/ui/primitives";
import BellRing from "lucide-react-native/icons/bell-ring";
import { useCopy } from "@/ui/copy";
import { allowDevicePermission, readDevicePermission } from "../../permissions/device-permissions";
import { accountPushAvailable, enableAccountPush, syncAccountPush } from "../model/push-account";
import { useAccount } from "./account-context";
import { pushTokenMessage } from "../../push/push-error-copy";
import { accountPushMessage, needsReregistration } from "./account-error-copy";
import { notificationStateLabel } from "../../settings/settings-summaries";

type State = "checking" | "off" | "on" | "blocked" | "read-error" | "error";

/**
 * Settings → Notifications → This phone: the OS permission state and the one action that changes
 * it. With a bycoda account the same action registers this phone for account notifications;
 * without one it only asks for the permission computer notifications need. The OS permission is
 * requested only from this row. Every read carries the shared deadline, so "checking" always ends.
 */
export function PushSection() {
  const copy = useCopy();
  const { runtime, device, retryRegistration } = useAccount();
  const [state, setState] = useState<State>("checking");
  // Why the last attempt failed, so the row names the cause instead of a generic failure.
  const [lastError, setLastError] = useState<unknown>(null);
  const accountPush = accountPushAvailable() && !!runtime && !!device;
  const owner = useMemo(() => ({ active: false, busy: false, refresh: false, settled: false }), [accountPush, runtime, device]);

  async function update(request: boolean) {
    if (!owner.active) return;
    if (owner.busy) { if (!request) owner.refresh = true; return; }
    owner.busy = true;
    // A foreground re-read keeps the known state on screen; only the first read and a tap show "Checking…".
    if (request || !owner.settled) setState("checking");
    let failure: "read-error" | "error" = "error";
    try {
      if (request) {
        const allowed = accountPush
          ? await enableAccountPush(runtime!, device!)
          : (await allowDevicePermission("notifications")).granted;
        if (allowed) {
          if (owner.active) setState("on");
          return;
        }
      }
      failure = "read-error";
      const permission = await readDevicePermission("notifications");
      if (!owner.active) return;
      if (!permission.granted) setState(permission.canAskAgain ? "off" : "blocked");
      else {
        failure = "error";
        if (accountPush) await syncAccountPush(runtime!, device!);
        if (owner.active) setState("on");
      }
    } catch (error) {
      if (owner.active) {
        setLastError(error);
        setState(failure);
      }
    } finally {
      owner.settled = true;
      owner.busy = false;
      if (owner.active && owner.refresh) { owner.refresh = false; void update(false); }
    }
  }

  useEffect(() => {
    if (process.env.EXPO_OS === "web") return;
    // Re-read on return from OS settings; foreground synchronization never asks for permission.
    owner.active = true;
    void update(false);
    const listener = AppState.addEventListener("change", (next) => { if (next === "active") void update(false); });
    return () => {
      owner.active = false;
      listener.remove();
    };
  }, [owner]); // eslint-disable-line react-hooks/exhaustive-deps -- `owner` changes exactly when the account scope does

  if (process.env.EXPO_OS === "web") return null;
  // Label names the subject, the trailing value the state, and the detail what a tap does.
  const status = state === "on" || state === "off" || state === "blocked" ? notificationStateLabel(state, copy) : undefined;
  const detail = {
    checking: copy("Kontrol ediliyor…", "Checking…"),
    on: copy("Değiştirmek için telefon ayarlarını aç.", "Open phone settings to change this."),
    off: copy("Bildirimlere izin vermek için dokun.", "Tap to allow notifications."),
    blocked: copy("Açmak için telefon ayarlarını aç.", "Open phone settings to turn them on."),
    "read-error": copy("Bildirim izni okunamadı. Yenilemek için dokun.", "Notification permission could not be read. Tap to refresh."),
    error: accountPush
      ? accountPushMessage(lastError, copy)
      : pushTokenMessage(lastError, copy) ?? copy("Bildirimler açılamadı.", "Notifications could not be turned on."),
  }[state];
  return (
    <NavigationGroup>
      <NavigationRow
        intent="command"
        icon={<SettingIcon glyph={BellRing} />}
        label={copy("Bildirimler", "Notifications")}
        trailing={status ? <StatusText label={status} tone={state === "blocked" ? "warning" : "default"} /> : undefined}
        detail={detail}
        detailLines={2}
        busy={state === "checking"}
        disabled={state === "checking"}
        separator={false}
        onPress={() => {
          if (state === "blocked" || state === "on") { void Linking.openSettings().catch(() => undefined); return; }
          // The service lost this phone's device record: registering again gives it a new one, and the
          // new device re-runs this row's sync.
          if (state === "error" && needsReregistration(lastError) && retryRegistration) { retryRegistration(); return; }
          void update(state === "off" || state === "error");
        }}
      />
    </NavigationGroup>
  );
}
