import { useEffect } from "react";
import { useAsyncAction } from "@/state/actions";
import { useActiveMachine } from "@/state/machines";
import { useHostClient } from "@/state/queries";
import { View } from "react-native";
import { NavigationGroup, Notice, SectionHeader, ToggleField } from "@/ui/primitives";
import { TimeoutError } from "../../../../src/shared/lib/withTimeout";
import { useInfoHint } from "@/ui/info-hint";
import { useCopy } from "@/ui/copy";
import { errorMessage } from "@/ui/error-message";
import { space } from "@/ui/tokens";
import { usePushPreferences, usePushStatus, type PushPreferenceKind } from "./push-model";

/** Phone pushes from the active computer: on/off and which moments. The test action lives in `usePushTestFromComputer`. */
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
    { kind: "input", label: copy("Onay veya cevap beklediğinde", "Waiting for approval or an answer") },
    { kind: "finished", label: copy("Ajan işini bitirdiğinde", "Agent finished") },
    { kind: "failed", label: copy("Bir tur başarısız olduğunda", "A turn failed") },
    { kind: "assistant", label: copy("Asistan güncellemeleri", "Assistant updates") },
    { kind: "approvals", label: copy("Onaylar", "Approvals") },
  ];
  const detail = !machine
    ? copy("Bildirimler için bir bilgisayar bağla.", "Connect a computer to receive notifications.")
    : status.state === "registered"
      ? copy("{p0} bu telefona bildirim gönderebilir.", "{p0} can notify this phone.", { p0: machine.name })
      : status.state === "off"
        ? copy("Kapalı. Bilgisayar bu telefona bildirim göndermez.", "Off. The computer does not notify this phone.")
        : status.state === "permission"
          ? copy("Önce yukarıdan bildirim iznini ver.", "Allow notifications above first.")
          : status.state === "unsupported"
            ? copy("{p0} bu özelliği desteklemiyor; bycoda'yı güncelle.", "{p0} does not support this yet; update bycoda there.", { p0: machine.name })
            : status.state === "unconfigured"
              ? copy("Bu uygulama sürümünde uzaktan bildirim yapılandırılmamış.", "Remote notifications are not configured in this app build.")
              : status.state === "error"
                ? status.error instanceof TimeoutError
                  ? copy("Bildirim hizmetinin yanıtı çok uzun sürdü.", "The notification service took too long to respond.")
                  : errorMessage(status.error, copy)
                : copy("Kontrol ediliyor…", "Checking…");
  const stateInfo = useInfoHint(status.state === "error" ? undefined : detail);
  return (
    <View style={{ gap: space.sm }}>
      <SectionHeader flush title={copy("Bilgisayardan bildirimler", "Notifications from your computer")} trailing={stateInfo.button} />
      {stateInfo.panel}
      {status.state === "error" ? <Notice tone="warning" message={detail} onRetry={client ? retry : undefined} /> : null}
      <NavigationGroup>
        <ToggleField
          label={copy("Telefona bildirim gönder", "Notify this phone")}
          help={copy(
            "Bilgisayarın başında değilken gelir. Bildirimde proje ve oturum adları yer almaz.",
            "Sent while you are away from the computer. Project and conversation names are never included.",
          )}
          value={preferences.enabled}
          onChange={(enabled) => preferences.update({ enabled })}
        />
      </NavigationGroup>
      {preferences.enabled ? (
        <NavigationGroup style={{ marginStart: space.lg }}>
          {events.map(({ kind, label }) => (
            <ToggleField
              key={kind}
              label={label}
              value={preferences.events[kind]}
              onChange={(value) => preferences.update({ events: { ...preferences.events, [kind]: value } })}
            />
          ))}
          {preferences.events.assistant ? (
            <ToggleField
              label={copy("Sessiz saatlerde acil güncellemeler", "Urgent updates during quiet hours")}
              value={preferences.assistantUrgentDuringQuiet}
              onChange={(assistantUrgentDuringQuiet) => preferences.update({ assistantUrgentDuringQuiet })}
            />
          ) : null}
        </NavigationGroup>
      ) : null}
    </View>
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
