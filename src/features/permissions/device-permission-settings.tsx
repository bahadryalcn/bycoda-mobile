import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, View } from "react-native";
import Bell from "lucide-react-native/icons/bell";
import Camera from "lucide-react-native/icons/camera";
import Mic from "lucide-react-native/icons/mic";
import ImageIcon from "lucide-react-native/icons/image";
import { useAsyncAction } from "@/state/actions";
import { Badge, Body, Button, FormActions, MutationState, NavigationGroup, NavigationRow, Row, SectionHeader, Stack, StateView, ValueRow } from "@/ui/primitives";
import { IconTile } from "@/ui/icon-tile";
import { useCopy } from "@/ui/copy";
import { useInfoHint } from "@/ui/info-hint";
import { space } from "@/ui/tokens";
import { useMobileTheme } from "@/ui/theme";
import { IssueSummary } from "@/ui/issue-summary";
import { PushSettings, usePushTestFromComputer } from "../push/PushSettings";
import { errorMessage } from "@/ui/error-message";
import { allowDevicePermission, readDevicePermission, testDeviceNotification, type DevicePermissionKind } from "./device-permissions";
import { failedPermissionKinds, markRetrying, pendingPermissionReads, permissionKinds, readDevicePermissionStatuses,
  type PermissionRead, type PermissionReads } from "./device-permission-status";

export function DevicePermissionSettings() {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const action = useAsyncAction();
  const retry = useAsyncAction();
  const [reads, setReads] = useState<PermissionReads>(pendingPermissionReads);
  const latestRead = useRef<Partial<Record<DevicePermissionKind, symbol>>>({});
  const mounted = useRef(true);
  const [operationTarget, setOperationTarget] = useState<DevicePermissionKind | "test" | "settings">();
  // A rejected concurrent request must not steal the active operation's feedback.
  const runFor = useCallback((target: NonNullable<typeof operationTarget>, work: () => Promise<unknown>) => action.run(async () => {
    if (mounted.current) setOperationTarget(target);
    return work();
  }), [action.run]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // Status reads never request a permission; each kind settles on its own.
  const refresh = useCallback(async (kinds: readonly DevicePermissionKind[] = permissionKinds) => {
    if (!mounted.current) return;
    const request = Symbol();
    for (const kind of kinds) latestRead.current[kind] = request;
    setReads((current) => markRetrying(current, kinds));
    await readDevicePermissionStatuses(kinds, readDevicePermission, (kind, outcome) => {
      if (mounted.current && latestRead.current[kind] === request) {
        setReads((current) => ({ ...current, [kind]: outcome }));
      }
    });
  }, []);
  // Passive status reads bypass the user-action flight: otherwise a mount or foreground read would disable every row.
  useEffect(() => {
    if (process.env.EXPO_OS === "web") return;
    void refresh();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => listener.remove();
  }, [refresh]);
  if (process.env.EXPO_OS === "web") return <StateView compact={false} tone="info" title={copy("Telefon izinlerini mobil uygulamada yönet.", "Manage phone permissions in the mobile app.")} />;
  // Unknown (pending or failed) reads show no badge; the issue summary explains failures.
  const status = (read: PermissionRead) => {
    if (read.status !== "ready") return undefined;
    if (read.permission.granted) return { label: copy("İzin verildi", "Granted"), tone: "success" } as const;
    if (read.permission.status === "undetermined") return { label: copy("Henüz sorulmadı", "Not asked") };
    if (read.permission.status === "denied") return { label: copy("Reddedildi", "Denied"), tone: "danger" } as const;
    return { label: copy("Kullanılamıyor", "Unavailable") };
  };
  const failed = failedPermissionKinds(reads);
  const labels = { camera: copy("Kamera", "Camera"), microphone: copy("Mikrofon", "Microphone"), notifications: copy("Bildirimler", "Notifications") };
  const reasons = {
    camera: copy("Bilgisayarı eşleştirmek için QR kodunu taramak.", "Scan pairing QR codes to connect a computer."),
    microphone: copy("Sesle yazmak ve asistanla konuşmak.", "Dictate messages and talk with the assistant."),
    notifications: copy("Bir ajan sana ihtiyaç duyduğunda veya işini bitirdiğinde uyarı almak.", "Alerts when an agent needs you or finishes."),
    photos: copy("Mesajlara fotoğraf ve dosya eklemek; yalnızca seçtiklerin paylaşılır.", "Attach photos and files to messages; only what you choose is shared."),
  };
  const permissionInfo = useInfoHint(`${labels.camera}: ${reasons.camera}
${labels.microphone}: ${reasons.microphone}
${labels.notifications}: ${reasons.notifications}
${copy("Fotoğraflar ve dosyalar", "Photos and files")}: ${reasons.photos}`, "inline");
  const testInfo = useInfoHint(copy("Bu telefonda dene yerel bir bildirim gösterir. Bilgisayardan dene ise bilgisayara bu telefona bildirim göndermesini söyler.", "Test on this phone shows a local notification here. Test from the computer asks the computer to send one to this phone."));
  const issues = failed.map((kind) => {
    const read = reads[kind];
    return read.status === "error" ? `${labels[kind]}: ${errorMessage(read.error, copy)}` : undefined;
  });
  const row = (kind: DevicePermissionKind, icon: typeof Camera) => {
    const read = reads[kind];
    const badge = status(read);
    const Icon = icon;
    return <><NavigationRow label={labels[kind]} trailing={badge ? <Badge {...badge} /> : null}
      accessibilityLabel={badge ? `${labels[kind]}. ${badge.label}` : labels[kind]}
      icon={<IconTile color={colors.muted}><Icon size={18} strokeWidth={2} color={colors.muted} /></IconTile>}
      busy={operationTarget === kind && action.isPending}
      disabled={action.isPending || read.status !== "ready"}
      onPress={() => { void runFor(kind, async () => {
        if (read.status === "ready" && read.permission.granted) await Linking.openSettings();
        else await allowDevicePermission(kind);
        await refresh();
      }); }} />{operationTarget === kind ? <MutationState mutation={action} /> : null}</>;
  };
  const notificationsGranted = reads.notifications.status === "ready" && reads.notifications.permission.granted;
  // Names the blocking permission state so a dimmed test button is never unexplained.
  const testBlockedReason = notificationsGranted ? null
    : reads.notifications.status === "pending" ? copy("Bildirim izni kontrol ediliyor.", "Checking notification permission.")
      : reads.notifications.status === "error" ? copy("Bildirim izni okunamadı. Yukarıdan yenile.", "Notification permission could not be read. Refresh above.")
        : copy("Önce bildirimlere izin ver.", "Allow notifications first.");
  const pushTest = usePushTestFromComputer();
  return (
    <>
      <View style={{ gap: space.sm }}>
        <SectionHeader flush title={copy("Bu telefonun izinleri", "This phone's permissions")} trailing={permissionInfo.button} />
        {permissionInfo.panel}
        <NavigationGroup>
          {row("camera", Camera)}
          {row("microphone", Mic)}
          {row("notifications", Bell)}
          {/* The system picker grants access per selection, so there is no app permission to read or request. */}
          <ValueRow label={copy("Fotoğraflar ve dosyalar", "Photos and files")}
            icon={<IconTile color={colors.muted}><ImageIcon size={18} strokeWidth={2} color={colors.muted} /></IconTile>}
            trailing={<Badge label={copy("Sistem seçicisi", "System picker")} />} />
        </NavigationGroup>
        <IssueSummary issues={issues} retrying={retry.isPending} onRetry={() => { void retry.run(() => refresh(failed)); }} />
        <Row style={{ justifyContent: "flex-end" }}>
          <Button label={copy("Telefon ayarlarını aç", "Open phone settings")} tone="secondary" disabled={action.isPending} busy={action.isPending && operationTarget === "settings"}
            onPress={() => { void runFor("settings", () => Linking.openSettings()); }} />
        </Row>
        {operationTarget === "settings" ? <MutationState mutation={action} /> : null}
      </View>
      <PushSettings />
      <View style={{ gap: space.sm }}>
        <SectionHeader flush title={copy("Deneme", "Test")} trailing={testInfo.button} />
        {testInfo.panel}
        <Stack>
          <Row style={{ flexWrap: "wrap" }}>
            <Button label={copy("Bu telefonda dene", "Test on this phone")} disabled={!notificationsGranted || action.isPending}
              busy={action.isPending && operationTarget === "test"}
              onPress={() => { void runFor("test", () => testDeviceNotification("bycoda", copy("Bildirimler bu telefonda çalışıyor.", "Notifications work on this phone."))); }} />
            <Button label={copy("Bilgisayardan dene", "Test from computer")} tone="secondary" disabled={pushTest.disabled} busy={pushTest.busy}
              onPress={pushTest.run} />
          </Row>
          {testBlockedReason && !action.isPending ? <Body muted selectable={false}>{testBlockedReason}</Body> : null}
          {operationTarget === "test" ? <MutationState mutation={action} /> : null}
          <MutationState mutation={pushTest.action} />
        </Stack>
      </View>
    </>
  );
}
