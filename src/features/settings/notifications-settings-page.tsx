import { useAsyncAction } from "@/state/actions";
import { Body, Button, MutationState, Row, Section, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { HintSection } from "@/ui/info-hint";
import { PushSection } from "../account/ui/PushSection";
import { AccountNotificationSettings } from "../account/ui/NotificationSettingsScreen";
import { PushSettings, usePushTestFromComputer } from "../push/PushSettings";
import { testDeviceNotification } from "../permissions/device-permissions";
import { usePermissionReads } from "../permissions/use-permission-reads";
import { SettingsPage } from "./settings-page";

/** Test notifications: a local one on this phone, or one sent by the active computer. */
function NotificationTests() {
  const copy = useCopy();
  const reads = usePermissionReads();
  const local = useAsyncAction();
  const pushTest = usePushTestFromComputer();
  const testHelp = copy(
    "Bu telefonda dene yerel bir bildirim gösterir. Bilgisayardan dene ise bilgisayara bu telefona bildirim göndermesini söyler.",
    "Test on this phone shows a local notification here. Test from the computer asks the computer to send one to this phone.",
  );
  const read = reads.notifications;
  const granted = read.status === "ready" && read.permission.granted;
  // Names the blocking permission state so a dimmed test button is never unexplained.
  const blockedReason = granted ? null
    : read.status === "pending" ? copy("Bildirim izni kontrol ediliyor.", "Checking notification permission.")
      : read.status === "error" ? copy("Bildirim izni okunamadı. Yukarıdan yenile.", "Notification permission could not be read. Refresh above.")
        : copy("Önce bildirimlere izin ver.", "Allow notifications first.");
  return (
    <HintSection title={copy("Deneme", "Test")} help={testHelp}>
      <Stack>
        <Row style={{ flexWrap: "wrap" }}>
          <Button label={copy("Bu telefonda dene", "Test on this phone")} disabled={!granted || local.isPending} busy={local.isPending}
            onPress={() => { void local.run(() => testDeviceNotification("bycoda", copy("Bildirimler bu telefonda çalışıyor.", "Notifications work on this phone."))); }} />
          <Button label={copy("Bilgisayardan dene", "Test from computer")} tone="secondary" disabled={pushTest.disabled} busy={pushTest.busy}
            onPress={pushTest.run} />
        </Row>
        {blockedReason && !local.isPending ? <Body muted selectable={false}>{blockedReason}</Body> : null}
        <MutationState mutation={local} />
        <MutationState mutation={pushTest.action} />
      </Stack>
    </HintSection>
  );
}

/**
 * Settings → Notifications: phone-relevant choices only. This phone's permission and its single
 * enable action, which computer events notify this phone, which account events reach phones (with
 * push detail text and quiet hours), then a test. Other notification policy stays on desktop.
 */
export function NotificationsSettingsPage() {
  const copy = useCopy();
  return (
    <SettingsPage title={copy("Bildirimler", "Notifications")}>
      {process.env.EXPO_OS === "web" ? null : (
        <Section title={copy("Bu telefonda", "This phone")}>
          <PushSection />
        </Section>
      )}
      <PushSettings />
      <AccountNotificationSettings />
      {process.env.EXPO_OS === "web" ? null : <NotificationTests />}
      {/* Computer-side notification policy is configured on desktop; one line says where. */}
      <Body muted>{copy("Diğer bildirim ayarları bilgisayardaki bycoda’dadır.", "Other notification settings are in bycoda on the computer.")}</Body>
    </SettingsPage>
  );
}
