import { useEffect } from "react";
import { router } from "expo-router";
import { useAsyncAction } from "@/state/actions";
import { useActiveMachine } from "@/state/machines";
import { useHostClient } from "@/state/queries";
import { NavigationGroup, Notice, StateView, ToggleField } from "@/ui/primitives";
import { pushTokenMessage } from "./push-error-copy";
import { HintSection, useInfoHint } from "@/ui/info-hint";
import { useCopy } from "@/ui/copy";
import { errorMessage } from "@/ui/error-message";
import { usePushPreferences, usePushStatus, type PushPreferenceKind } from "./push-model";

/**
 * Settings → Notifications → From your computer: on/off and which moments. Without an active
 * computer the switches stay visible but disabled, with the one way forward. The test action lives
 * in `usePushTestFromComputer`.
 */
export function PushSettings() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const client = useHostClient();
  const preferences = usePushPreferences();
  const status = usePushStatus((state) => state.status);
  const retry = usePushStatus((state) => state.retry);
  useEffect(() => {
    void preferences.hydrate();
  }, [preferences.hydrate]);
  const events: { kind: PushPreferenceKind; label: string }[] = [
    // Same names as the account's events; "approvals" are the assistant's own requests, not a session's.
    { kind: "input", label: copy("Oturum onay veya cevap beklediğinde", "A session needs approval or an answer") },
    { kind: "approvals", label: copy("Asistan onayını beklediğinde", "The assistant needs your approval") },
    { kind: "finished", label: copy("Ajan işini bitirdiğinde", "Agent finished") },
    { kind: "failed", label: copy("Ajan başarısız olduğunda", "Agent failed") },
    { kind: "assistant", label: copy("Asistan güncellemeleri", "Assistant updates") },
  ];
  const detail = !machine
    ? copy("Bildirimler için bir bilgisayar bağla.", "Connect a computer to receive notifications.")
    : status.state === "registered"
      ? copy("{p0} bu telefona bildirim gönderebilir.", "{p0} can notify this phone.", { p0: machine.name })
      : status.state === "off"
        ? copy("Kapalı. Bilgisayar bu telefona bildirim göndermez.", "Off. The computer does not notify this phone.")
        : status.state === "permission"
          ? copy("Önce yukarıdaki “Bu telefonda” bölümünden bildirim iznini ver.", "Allow notifications under “This phone” above first.")
          : status.state === "unsupported"
            ? copy("{p0} bu özelliği desteklemiyor; bycoda'yı güncelle.", "{p0} does not support this yet; update bycoda there.", { p0: machine.name })
            : status.state === "unconfigured"
              ? copy("Bu uygulama sürümünde uzaktan bildirim yapılandırılmamış.", "Remote notifications are not configured in this app build.")
              : status.state === "disconnected"
                ? copy("{p0} bağlı değil. Bildirim seçimlerin bağlandığında gönderilir.", "{p0} is not connected. Your notification choices are sent when it connects.", { p0: machine.name })
                : status.state === "error"
                  ? pushTokenMessage(status.error, copy) ?? errorMessage(status.error, copy)
                  : copy("Kontrol ediliyor…", "Checking…");
  // The state line is status, not help, so it stays visible under the heading.
  const stateInfo = useInfoHint(status.state === "error" || !machine ? undefined : detail, "visible");
  return (
    <HintSection
      title={copy("Bilgisayarından", "From your computer")}
      help={copy(
        "Bağlı bilgisayarın bu telefona doğrudan gönderir. Hesabından gelen bildirimler aşağıda ayrı ayarlanır.",
        "Your connected computer sends these straight to this phone. Notifications from your account are set separately below.",
      )}
    >
      {stateInfo.panel}
      {!machine ? (
        <StateView
          compact
          title={copy("Bilgisayar bildirimleri için bir bilgisayar bağla", "Connect a computer for computer notifications")}
          action={{ label: copy("Bilgisayar bağla", "Connect a computer"), onPress: () => router.navigate("/machines") }}
        />
      ) : null}
      {status.state === "error" ? <Notice tone="warning" message={detail} onRetry={client ? retry : undefined} /> : null}
      <NavigationGroup>
        <ToggleField
          label={copy("Telefona bildirim gönder", "Notify this phone")}
          help={copy(
            "Bilgisayarın başında değilken gelir. Bildirimde proje ve oturum adları yer almaz.",
            "Sent while you are away from the computer. Project and session names are never included.",
          )}
          value={preferences.enabled}
          disabled={!machine}
          onChange={(enabled) => preferences.update({ enabled })}
        />
        {/* Event switches follow the main switch in the same group, without an indented second group. */}
        {preferences.enabled ? <>
          {events.map(({ kind, label }) => (
            <ToggleField
              key={kind}
              label={label}
              value={preferences.events[kind]}
              disabled={!machine}
              onChange={(value) => preferences.update({ events: { ...preferences.events, [kind]: value } })}
            />
          ))}
        </> : null}
      </NavigationGroup>
    </HintSection>
  );
}

/** "Test from computer": asks the active computer to send a test notification to this phone. */
export function usePushTestFromComputer() {
  const copy = useCopy();
  const client = useHostClient();
  const action = useAsyncAction();
  const status = usePushStatus((state) => state.status);
  return {
    action,
    disabled: !client || status.state !== "registered" || action.isPending,
    busy: action.isPending,
    run: () => {
      void action.run(async () => {
        const result = await client!.request<{ sent: boolean }>("push.test", {
          body: copy("Bilgisayar bildirimleri bu telefonda çalışıyor.", "Computer notifications work on this phone."),
        });
        if (!result.sent) throw new Error(copy("Bilgisayar bu telefonu kayıtlı bulamadı.", "The computer has no registration for this phone."));
      });
    },
  };
}
