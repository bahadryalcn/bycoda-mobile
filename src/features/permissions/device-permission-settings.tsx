import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, View } from "react-native";
import Bell from "lucide-react-native/icons/bell";
import Camera from "lucide-react-native/icons/camera";
import Mic from "lucide-react-native/icons/mic";
import ImageIcon from "lucide-react-native/icons/image";
import { useAsyncAction } from "@/state/actions";
import { Button, MutationState, NavigationGroup, NavigationRow, Row, SectionHeader, SettingIcon, StateView, StatusText, ValueRow } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useInfoHint } from "@/ui/info-hint";
import { space } from "@/ui/tokens";
import { IssueSummary } from "@/ui/issue-summary";
import { errorMessage } from "@/ui/error-message";
import { allowDevicePermission, readDevicePermission, type DevicePermissionKind } from "./device-permissions";
import { failedPermissionKinds, markRetrying, pendingPermissionReads, permissionKinds, readDevicePermissionStatuses,
  type PermissionRead, type PermissionReads } from "./device-permission-status";

/**
 * Settings → Phone permissions: one row per permission with its state. A tap asks in place or, once
 * granted or permanently denied, opens phone settings. Notification choices live on the
 * Notifications page.
 */
export function DevicePermissionSettings() {
  const copy = useCopy();
  const action = useAsyncAction();
  const retry = useAsyncAction();
  const [reads, setReads] = useState<PermissionReads>(pendingPermissionReads);
  const latestRead = useRef<Partial<Record<DevicePermissionKind, symbol>>>({});
  const mounted = useRef(true);
  const [operationTarget, setOperationTarget] = useState<DevicePermissionKind | "settings">();
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
    if (read.permission.status === "undetermined") return { label: copy("Henüz sorulmadı", "Not asked"), tone: "default" } as const;
    if (read.permission.status === "denied") return { label: copy("Reddedildi", "Denied"), tone: "danger" } as const;
    return { label: copy("Kullanılamıyor", "Unavailable"), tone: "default" } as const;
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
  const issues = failed.map((kind) => {
    const read = reads[kind];
    return read.status === "error" ? `${labels[kind]}: ${errorMessage(read.error, copy)}` : undefined;
  });
  const row = (kind: DevicePermissionKind, icon: typeof Camera) => {
    const read = reads[kind];
    const badge = status(read);
    const Icon = icon;
    // A pending read is named, never a silent blank: reads carry a deadline and then become errors.
    const state = badge ?? (read.status === "pending" ? { label: copy("Kontrol ediliyor…", "Checking…"), tone: "default" } as const
      : { label: copy("Okunamadı", "Unreadable"), tone: "warning" } as const);
    return <><NavigationRow label={labels[kind]} trailing={<StatusText {...state} />} intent="command"
      accessibilityLabel={`${labels[kind]}. ${state.label}`}
      icon={<SettingIcon glyph={Icon} />}
      busy={operationTarget === kind && action.isPending}
      disabled={action.isPending || read.status !== "ready"}
      onPress={() => { void runFor(kind, async () => {
        if (read.status === "ready" && read.permission.granted) await Linking.openSettings();
        else await allowDevicePermission(kind);
        await refresh();
      }); }} />{operationTarget === kind ? <MutationState mutation={action} /> : null}</>;
  };
  return (
    <>
      <View style={{ gap: space.sm }}>
        <SectionHeader title={copy("Bu telefonun izinleri", "This phone's permissions")} trailing={permissionInfo.button} />
        {permissionInfo.panel}
        <NavigationGroup>
          {row("camera", Camera)}
          {row("microphone", Mic)}
          {row("notifications", Bell)}
          {/* The system picker grants access per selection, so there is no app permission to read or request. */}
          <ValueRow label={copy("Fotoğraflar ve dosyalar", "Photos and files")}
            icon={<SettingIcon glyph={ImageIcon} />}
            value={copy("Sistem seçicisi", "System picker")} />
        </NavigationGroup>
        <IssueSummary issues={issues} retrying={retry.isPending} onRetry={() => { void retry.run(() => refresh(failed)); }} />
        <Row style={{ justifyContent: "flex-end" }}>
          <Button label={copy("Telefon ayarlarını aç", "Open phone settings")} tone="secondary" disabled={action.isPending} busy={action.isPending && operationTarget === "settings"}
            onPress={() => { void runFor("settings", () => Linking.openSettings()); }} />
        </Row>
        {operationTarget === "settings" ? <MutationState mutation={action} /> : null}
      </View>
    </>
  );
}
