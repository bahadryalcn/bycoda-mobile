import { useEffect, useState } from "react";
import { Button, Notice, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { HintSection } from "@/ui/info-hint";
import { readDevicePermission } from "../../permissions/device-permissions";
import { accountPushAvailable, enableAccountPush, syncAccountPush } from "../model/push-account";
import { useAccount } from "./account-context";

type State = "checking" | "off" | "on" | "blocked" | "error";

/** Account notifications on this phone. The OS permission is requested only from the button here. */
export function PushSection() {
  const copy = useCopy();
  const { runtime, device } = useAccount();
  const [state, setState] = useState<State>("checking");
  const available = accountPushAvailable();

  useEffect(() => {
    if (!available || !runtime || !device) return;
    let cancelled = false;
    readDevicePermission("notifications")
      .then(async (permission) => {
        if (cancelled) return;
        if (!permission.granted) return setState(permission.canAskAgain ? "off" : "blocked");
        await syncAccountPush(runtime, device);
        if (!cancelled) setState("on");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [available, runtime, device]);

  if (!available || !runtime || !device) return null;
  const turnOn = async () => {
    setState("checking");
    try {
      setState((await enableAccountPush(runtime, device)) ? "on" : "blocked");
    } catch {
      setState("error");
    }
  };
  return (
    <HintSection title={copy("Bildirimler", "Notifications")} help={state === "on"
      ? copy("Hesap bildirimleri bu telefonda açık. Kapatmak için sistem ayarlarını kullan.", "Account notifications are on for this phone. Turn them off in system settings.")
      : copy("Yeni cihaz girişi gibi hesap olaylarını bu telefona gönder.", "Send account events, such as a sign-in from a new device, to this phone.")}>
      <Stack>
        {state === "on" ? null : (
          <>
            {state === "blocked" ? (
              <Notice tone="warning" message={copy("Bildirim izni kapalı. Sistem ayarlarından aç.", "Notifications are blocked. Allow them in system settings.")} />
            ) : null}
            {state === "error" ? (
              <Notice tone="danger" message={copy("Bildirimler açılamadı. Yeniden dene.", "Notifications could not be turned on. Try again.")} />
            ) : null}
            <Button
              label={copy("Bu telefonda bildirimleri aç", "Turn on notifications on this phone")}
              tone="secondary"
              busy={state === "checking"}
              disabled={state === "checking"}
              onPress={() => void turnOn()}
            />
          </>
        )}
      </Stack>
    </HintSection>
  );
}
