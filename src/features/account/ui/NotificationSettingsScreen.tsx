import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ErrorNotice, Loading, NavigationGroup, Notice, Section, Stack, StateView, ToggleField, Skeleton } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { TimeField } from "@/ui/time-field";
import { HoursOverview } from "@/ui/week-hours";
import { windowBlocks } from "@/ui/week-hours-model";
import { AccountApiError, ClockTime, NOTIFICATION_EVENTS, type NotificationChannel, type NotificationEventKey, type NotificationSettings, type QuietHours } from "../contracts";
import { ACCOUNT_NOTIFICATION_SETTINGS_KEY, channelEnabled, setChannel, withQuietHours } from "../model/notification-settings";
import type { SaveControl } from "../model/notification-saves";
import { useAccount } from "./account-context";
import { useNotificationSaves } from "./use-notification-saves";
import { useGracedReadError } from "./use-graced-read-error";
import { accountReadMessage, deviceLimitReached, registrationMessage } from "./account-error-copy";

const KEY = ACCOUNT_NOTIFICATION_SETTINGS_KEY;
const CHANNELS: { channel: Extract<NotificationChannel, "push" | "in_app">; tr: string; en: string }[] = [
  { channel: "push", tr: "Hesabından bu telefona", en: "From your account to phones" },
  { channel: "in_app", tr: "Hesabından uygulama içinde", en: "From your account in the app" },
];

/** Each saved control has its own id, so its pending and failed state never leaks to another row. */
function preferenceControl(event: NotificationEventKey, channel: (typeof CHANNELS)[number]["channel"]): SaveControl<boolean> {
  return {
    id: `${channel}:${event}`,
    read: (settings) => channelEnabled(settings, event, channel),
    write: (settings, value) => setChannel(settings, event, channel, value),
  };
}
const PUSH_DETAILS: SaveControl<boolean> = {
  id: "pushShowDetails",
  read: (settings) => settings.pushShowDetails,
  write: (settings, value) => ({ ...settings, pushShowDetails: value }),
};
const QUIET: SaveControl<QuietHours | null> = { id: "quietHours", read: (settings) => settings.quietHours ?? null, write: withQuietHours };

const OPTIONAL_EVENTS = NOTIFICATION_EVENTS.filter((event) => !event.mandatory);
const MANDATORY_EVENTS = NOTIFICATION_EVENTS.filter((event) => event.mandatory);

type QuietDraft = { on: boolean; start: string; end: string };

function quietValid(draft: QuietDraft) {
  return draft.start !== draft.end && ClockTime.safeParse(draft.start).success && ClockTime.safeParse(draft.end).success;
}

function sameQuiet(a: QuietHours | null, b: QuietHours | null) {
  if (!a || !b) return !a === !b;
  return a.start === b.start && a.end === b.end;
}

/**
 * Settings → Notifications, the account part: event x channel toggles that matter on a phone (push,
 * in app), the mandatory security alerts, push detail text and quiet hours. Rendered inside the one
 * Notifications page; each toggle saves on its own.
 */
export function AccountNotificationSettings() {
  const copy = useCopy();
  const { status, runtime, device, registerError, retryRegistration } = useAccount();
  const saves = useNotificationSaves(KEY);
  // The client is captured per change, so a response from a previous account cannot be applied here.
  const put = (body: NotificationSettings) => runtime!.client.putNotificationSettings({ body });
  const settings = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const loaded = await runtime!.client.getNotificationSettings();
      saves.adopt(loaded);
      return loaded;
    },
    // Settings are user-scoped on the server: they load and save without this phone's device
    // registration, which can fail on its own (device limit, offline) and is reported separately.
    enabled: status === "signedIn" && !!runtime,
  });
  const settingsError = useGracedReadError(settings);
  const labels: Record<NotificationEventKey, string> = {
    "account.new_device_sign_in": copy("Yeni cihazdan giriş", "Sign-in from a new device"),
    "agent.finished": copy("Ajan işini bitirdiğinde", "Agent finished"),
    "agent.failed": copy("Ajan başarısız olduğunda", "Agent failed"),
    "approval.pending": copy("Onay beklediğinde", "Approval pending"),
    "summary.daily": copy("Günlük özet", "Daily summary"),
    "announcement.published": copy("Duyurular", "Announcements"),
    "account.deletion_scheduled": copy("Hesap silme zamanlandı", "Account deletion scheduled"),
    "account.phone_connect_approved": copy("Telefon bağlantısı onaylandı", "Phone connection approved"),
  };
  const data = settings.data;
  const hasQuiet = !!data?.quietHours;
  const [quiet, setQuiet] = useState<QuietDraft>({ on: false, start: "22:00", end: "07:00" });
  useEffect(() => {
    if (data) setQuiet({ on: !!data.quietHours, start: data.quietHours?.start ?? "22:00", end: data.quietHours?.end ?? "07:00" });
  }, [data?.quietHours?.start, data?.quietHours?.end, hasQuiet]); // eslint-disable-line react-hooks/exhaustive-deps -- re-sync only when saved quiet hours change

  const busy = (id: string) => (saves.pending[id] ?? 0) > 0;
  const failedText = (id: string) => (saves.failures[id] ? copy("Kaydedilemedi", "Not saved") : undefined);
  const failedCount = Object.keys(saves.failures).length;
  const anyBusy = Object.keys(saves.pending).length > 0;
  const retryFailed = () => Object.values(saves.failures).forEach((retry) => retry());

  function commitQuiet(next: QuietHours | null) {
    if (!data || sameQuiet(data.quietHours ?? null, next)) return;
    saves.save(QUIET, next, put);
  }
  // A time field is saved as soon as both times are valid; a partial entry stays on screen only.
  function editQuiet(next: QuietDraft) {
    setQuiet(next);
    if (!next.on) commitQuiet(null);
    else if (quietValid(next)) commitQuiet({ start: next.start, end: next.end, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  }

  const accountTitle = copy("Hesabından", "From your account");
  if (status === "unavailable") return null;
  if (status === "loading" || (status === "signedIn" && !runtime)) {
    return (
      <Section title={accountTitle}>
        <Loading immediate />
      </Section>
    );
  }
  if (status !== "signedIn")
    return (
      <Section title={accountTitle}>
        <StateView
          compact
          title={copy("Hesap bildirimleri için giriş yap", "Sign in for account notifications")}
          action={{ label: copy("Giriş yap", "Sign in"), onPress: () => router.navigate("/account") }}
        />
      </Section>
    );
  // Sections sit directly in the page so they share its group rhythm.
  return (
    <>
        {/* Without a device record the account cannot reach this phone; the settings still load and save. */}
        {registerError && !device ? (
          <ErrorNotice
            error={registerError}
            onRetry={deviceLimitReached(registerError) ? undefined : retryRegistration}
            action={deviceLimitReached(registerError) ? { label: copy("Hesabı aç", "Open account"), onPress: () => router.navigate("/account") } : undefined}
            message={registrationMessage(registerError, copy, "elsewhere")}
          />
        ) : null}
        <ErrorNotice
          // A rejected session fails registration and this read alike; the notice above already says so.
          error={registerError instanceof AccountApiError && registerError.code === "unauthorized" && settingsError instanceof AccountApiError && settingsError.code === "unauthorized" ? null : settingsError}
          onRetry={() => void settings.refetch()}
          message={settingsError ? accountReadMessage(settingsError, copy, copy("Bildirim ayarları alınamadı.", "Notification settings could not be loaded.")) : undefined}
        />
        {failedCount > 0 ? (
          <Notice
            tone="danger"
            message={copy("Bazı ayarlar kaydedilemedi.", "Some settings could not be saved.")}
            onRetry={retryFailed}
            retryLabel={copy("Yeniden dene", "Retry")}
            retrying={anyBusy}
          />
        ) : null}
        {!data ? (
          settings.isPending ? <Skeleton /> : null
        ) : (
          <>
            {CHANNELS.map(({ channel, tr, en }) => (
              <Section key={channel} title={copy(tr, en)}>
                <NavigationGroup>
                  {OPTIONAL_EVENTS.map((event) => {
                    const control = preferenceControl(event.key, channel);
                    return (
                      <ToggleField
                        key={event.key}
                        label={labels[event.key]}
                        detail={failedText(control.id)}
                        value={control.read(data)}
                        disabled={busy(control.id)}
                        onChange={(value) => saves.save(control, value, put)}
                      />
                    );
                  })}
                </NavigationGroup>
              </Section>
            ))}
            <Section title={copy("Güvenlik bildirimleri", "Security alerts")}>
              <NavigationGroup>
                {MANDATORY_EVENTS.map((event) => (
                  <ToggleField key={event.key} label={labels[event.key]} detail={copy("Güvenlik için zorunlu; kapatılamaz.", "Required for security; it cannot be turned off.")} value disabled onChange={() => undefined} />
                ))}
              </NavigationGroup>
            </Section>
            <Section title={copy("Bildirim ayrıntıları", "Push details")}>
              <NavigationGroup>
              <ToggleField
                label={copy("Bildirimde ayrıntıları göster", "Show details in push text")}
                help={copy("Kapalıyken bildirimler genel bir metin içerir.", "When off, notifications carry generic text.")}
                detail={failedText(PUSH_DETAILS.id)}
                value={data.pushShowDetails}
                disabled={busy(PUSH_DETAILS.id)}
                onChange={(value) => saves.save(PUSH_DETAILS, value, put)}
              />
              </NavigationGroup>
            </Section>
            <Section title={copy("Sessiz saatler", "Quiet hours")}>
              <Stack>
                <NavigationGroup>
                  <ToggleField
                    label={copy("Sessiz saatleri kullan", "Use quiet hours")}
                    detail={failedText(QUIET.id)}
                    value={quiet.on}
                    disabled={busy(QUIET.id)}
                    onChange={(on) => editQuiet({ ...quiet, on })}
                  />
                </NavigationGroup>
                {quiet.on ? (
                  <>
                    <TimeField label={copy("Başlangıç (SS:DD)", "Start (HH:MM)")} value={quiet.start} onChange={(start) => editQuiet({ ...quiet, start })} disabled={busy(QUIET.id)} />
                    <TimeField label={copy("Bitiş (SS:DD)", "End (HH:MM)")} value={quiet.end} onChange={(end) => editQuiet({ ...quiet, end })} disabled={busy(QUIET.id)} />
                    {quiet.start === quiet.end ? (
                      <Notice tone="danger" message={copy("Başlangıç ve bitiş saatleri farklı olmalı.", "Start and end times must differ.")} />
                    ) : (
                      <HoursOverview tone="muted" rows={[{ key: "daily", label: copy("Her gün", "Daily"), blocks: windowBlocks(quiet.start, quiet.end) }]} />
                    )}
                  </>
                ) : null}
              </Stack>
            </Section>
          </>
        )}
    </>
  );
}
