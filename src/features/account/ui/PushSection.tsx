import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { router, type Href } from "expo-router";
import { NavigationGroup, NavigationRow, Notice, SettingIcon, Stack } from "@/ui/primitives";
import BellRing from "lucide-react-native/icons/bell-ring";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import { useCopy } from "@/ui/copy";
import { HintSection } from "@/ui/info-hint";
import { readDevicePermission } from "../../permissions/device-permissions";
import { accountPushAvailable, enableAccountPush, syncAccountPush } from "../model/push-account";
import { useAccount } from "./account-context";

type State = "checking" | "off" | "on" | "blocked" | "read-error" | "error";

/** Account notifications on this phone. The OS permission is requested only from the button here. */
export function PushSection() {
  const copy = useCopy();
  const { runtime, device } = useAccount();
  const [state, setState] = useState<State>("checking");
  const available = accountPushAvailable();
  const owner = useMemo(() => ({ active: false, busy: false, refresh: false }), [available, runtime, device]);

  async function update(request: boolean) {
    if (!owner.active || !available || !runtime || !device) return;
    if (owner.busy) { if (!request) owner.refresh = true; return; }
    owner.busy = true;
    setState("checking");
    let failure: "read-error" | "error" = "error";
    try {
      if (request && await enableAccountPush(runtime, device)) {
        if (owner.active) setState("on");
        return;
      }
      failure = "read-error";
      const permission = await readDevicePermission("notifications");
      if (!owner.active) return;
      if (!permission.granted) setState(permission.canAskAgain ? "off" : "blocked");
      else {
        failure = "error";
        await syncAccountPush(runtime, device);
        if (owner.active) setState("on");
      }
    } catch {
      if (owner.active) setState(failure);
    } finally {
      owner.busy = false;
      if (owner.active && owner.refresh) { owner.refresh = false; void update(false); }
    }
  }

  useEffect(() => {
    if (!available || !runtime || !device) return;
    // Re-read on return from OS settings; foreground synchronization never asks for permission.
    owner.active = true;
    void update(false);
    const listener = AppState.addEventListener("change", state => { if (state === "active") void update(false); });
    return () => {
      owner.active = false;
      listener.remove();
    };
  }, [available, runtime, device, owner]);

  if (!runtime) return null;
  return (
    <HintSection title={copy("Bildirimler", "Notifications")} help={!available || !device
      ? copy("Bu telefonda bildirim gönderimi kullanılamıyor. Uygulama içi bildirimleri yine de ayarlayabilirsin.", "Push notifications are unavailable on this phone. You can still set in-app notifications.")
      : state === "on"
        ? copy("Hesap bildirimleri bu telefonda açık. Kapatmak için sistem ayarlarını kullan.", "Account notifications are on for this phone. Turn them off in system settings.")
        : copy("Yeni cihaz girişi gibi hesap olaylarını bu telefona gönder.", "Send account events, such as a sign-in from a new device, to this phone.")}>
      <Stack>
        {available && device && state !== "on" ? (
          <>
            {state === "blocked" ? (
              <Notice tone="warning" message={copy("Bildirim izni kapalı. Sistem ayarlarından aç.", "Notifications are blocked. Allow them in system settings.")} />
            ) : null}
            {state === "error" ? (
              <Notice tone="danger" message={copy("Bildirimler açılamadı. Yeniden dene.", "Notifications could not be turned on. Try again.")} />
            ) : null}
            {state === "read-error" ? <Notice tone="danger" message={copy("Bildirim izni okunamadı. Yeniden dene.", "Notification permission could not be read. Try again.")} /> : null}
          </>
        ) : null}
        <NavigationGroup>
          {available && device && state !== "on" ? (
            // A command row keeps the page's list rhythm; a floating text button sat inset from the rows.
            <NavigationRow
              intent="command"
              icon={<SettingIcon glyph={BellRing} />}
              label={state === "read-error" ? copy("Yenile", "Refresh") : state === "blocked" ? copy("Telefon ayarlarını aç", "Open phone settings") : copy("Bu telefonda bildirimleri aç", "Turn on notifications on this phone")}
              busy={state === "checking"}
              disabled={state === "checking"}
              onPress={() => void update(state !== "read-error")}
            />
          ) : null}
          <NavigationRow
            label={copy("Bildirim ayarları", "Notification settings")}
            icon={<SettingIcon glyph={SlidersHorizontal} />}
            onPress={() => router.navigate("/account-notifications" as Href)}
          />
        </NavigationGroup>
      </Stack>
    </HintSection>
  );
}
