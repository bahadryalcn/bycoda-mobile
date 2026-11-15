import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Body, Button, ErrorNotice, Screen, Section, Stack, StateView, ToggleField, Skeleton } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { TimeField } from "@/ui/time-field";
import { HoursOverview } from "@/ui/week-hours";
import { windowBlocks } from "@/ui/week-hours-model";
import { ClockTime, NOTIFICATION_EVENTS, type NotificationChannel, type NotificationEventKey, type NotificationSettings } from "../contracts";
import { channelEnabled, setChannel, withQuietHours } from "../model/notification-settings";
import { useAccount } from "./account-context";

const KEY = ["account", "notification-settings"] as const;
const CHANNELS: { channel: Extract<NotificationChannel, "push" | "in_app">; tr: string; en: string }[] = [
  { channel: "push", tr: "Bu telefona bildirim", en: "Push to phones" },
  { channel: "in_app", tr: "Uygulama içi", en: "In app" },
];

/** Event x channel toggles that matter on a phone (push, in app), quiet hours and push detail text. */
export function NotificationSettingsScreen() {
  const copy = useCopy();
  const { runtime, device } = useAccount();
  const queries = useQueryClient();
  const settings = useQuery({ queryKey: KEY, queryFn: () => runtime!.client.getNotificationSettings(), enabled: !!runtime && !!device });
  const save = useMutation({
    mutationFn: (next: NotificationSettings) => runtime!.client.putNotificationSettings({ body: next }),
    onSuccess: (saved) => queries.setQueryData(KEY, saved),
  });
  const labels: Record<NotificationEventKey, string> = {
    "account.new_device_sign_in": copy("Yeni cihazdan giriş", "Sign-in from a new device"),
    "agent.finished": copy("Agent tamamlandı", "Agent finished"),
    "agent.failed": copy("Agent başarısız oldu", "Agent failed"),
    "approval.pending": copy("Onay bekliyor", "Approval pending"),
    "summary.daily": copy("Günlük özet", "Daily summary"),
    "announcement.published": copy("Duyurular", "Announcements"),
    "account.deletion_scheduled": copy("Hesap silme zamanlandı", "Account deletion scheduled"),
    "account.phone_connect_approved": copy("Telefon bağlantısı onaylandı", "Phone connection approved"),
  };
  const title = copy("Bildirim ayarları", "Notification settings");
  const data = settings.data;
  const hasQuiet = !!data?.quietHours;
  const [quiet, setQuiet] = useState({ on: false, start: "22:00", end: "07:00" });
  useEffect(() => {
    if (data) setQuiet({ on: !!data.quietHours, start: data.quietHours?.start ?? "22:00", end: data.quietHours?.end ?? "07:00" });
  }, [data?.quietHours?.start, data?.quietHours?.end, hasQuiet]); // eslint-disable-line react-hooks/exhaustive-deps -- re-sync only when saved quiet hours change
  const quietValid = ClockTime.safeParse(quiet.start).success && ClockTime.safeParse(quiet.end).success;

  if (!runtime || !device)
    return (
      <Screen title={title}>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <StateView
            title={copy("Bildirim ayarlarını yönetmek için giriş yap", "Sign in to manage notification settings")}
            action={{ label: copy("Giriş yap", "Sign in"), onPress: () => router.navigate("/account") }}
          />
        </View>
      </Screen>
    );
  return (
    <Screen title={title}>
      <Stack>
        <ErrorNotice error={settings.error} onRetry={() => void settings.refetch()} message={copy("Ayarlar alınamadı.", "Settings could not be loaded.")} />
        <ErrorNotice error={save.error} message={copy("Ayarlar kaydedilemedi.", "Settings could not be saved.")} />
        {!data ? (
          settings.isPending ? <Skeleton /> : null
        ) : (
          <>
            {CHANNELS.map(({ channel, tr, en }) => (
              <Section key={channel} title={copy(tr, en)}>
                <Stack>
                  {NOTIFICATION_EVENTS.map((event) => (
                    <ToggleField
                      key={event.key}
                      label={labels[event.key]}
                      detail={event.mandatory ? copy("Güvenlik için zorunlu; kapatılamaz.", "Required for security; it cannot be turned off.") : undefined}
                      value={event.mandatory ? true : channelEnabled(data, event.key, channel)}
                      disabled={event.mandatory || save.isPending}
                      onChange={(value) => save.mutate(setChannel(data, event.key, channel, value))}
                    />
                  ))}
                </Stack>
              </Section>
            ))}
            <Section title={copy("Bildirim ayrıntıları", "Push details")}>
              <ToggleField
                label={copy("Bildirimde ayrıntıları göster", "Show details in push text")}
                help={copy("Kapalıyken bildirimler genel bir metin içerir.", "When off, notifications carry generic text.")}
                value={data.pushShowDetails}
                disabled={save.isPending}
                onChange={(value) => save.mutate({ ...data, pushShowDetails: value })}
              />
            </Section>
            <Section title={copy("Sessiz saatler", "Quiet hours")}>
              <Stack>
                <ToggleField
                  label={copy("Sessiz saatleri kullan", "Use quiet hours")}
                  value={quiet.on}
                  disabled={save.isPending}
                  onChange={(on) => {
                    setQuiet({ ...quiet, on });
                    if (!on && data.quietHours) save.mutate(withQuietHours(data, null));
                  }}
                />
                {quiet.on ? (
                  <>
                    <TimeField label={copy("Başlangıç (SS:DD)", "Start (HH:MM)")} value={quiet.start} onChange={(start) => setQuiet({ ...quiet, start })} disabled={save.isPending} />
                    <TimeField label={copy("Bitiş (SS:DD)", "End (HH:MM)")} value={quiet.end} onChange={(end) => setQuiet({ ...quiet, end })} disabled={save.isPending} />
                    <HoursOverview tone="muted" rows={[{ key: "daily", label: copy("Her gün", "Daily"), blocks: windowBlocks(quiet.start, quiet.end) }]} />
                    <Button
                      label={copy("Sessiz saatleri kaydet", "Save quiet hours")}
                      tone="secondary"
                      disabled={!quietValid || save.isPending}
                      busy={save.isPending}
                      onPress={() => save.mutate(withQuietHours(data, { start: quiet.start, end: quiet.end, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }))}
                    />
                  </>
                ) : null}
              </Stack>
            </Section>
          </>
        )}
      </Stack>
    </Screen>
  );
}
