import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import { useAsyncAction } from "@/state/actions";
import { Body, Button, Disclosure, FormActions, MutationState, NavigationGroup, NavigationRow, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { IssueSummary } from "@/ui/issue-summary";
import { errorMessage } from "@/ui/error-message";
import { allowDevicePermission, readDevicePermission, testDeviceNotification, type DevicePermissionKind } from "./device-permissions";
import { failedPermissionKinds, markRetrying, pendingPermissionReads, permissionKinds, readDevicePermissionStatuses,
  type PermissionRead, type PermissionReads } from "./device-permission-status";

export function DevicePermissionSettings() {
  const copy = useCopy();
  const action = useAsyncAction();
  const [reads, setReads] = useState<PermissionReads>(pendingPermissionReads);
  const mounted = useRef(true);
  const [operationTarget, setOperationTarget] = useState<DevicePermissionKind | "refresh" | "test" | "settings">("refresh");
  // A rejected concurrent request must not steal the active operation's feedback.
  const runFor = useCallback((target: typeof operationTarget, work: () => Promise<unknown>) => action.run(async () => {
    if (mounted.current) setOperationTarget(target);
    return work();
  }), [action.run]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // Status reads never request a permission; each kind settles on its own.
  const refresh = useCallback(async (kinds: readonly DevicePermissionKind[] = permissionKinds) => {
    setReads((current) => markRetrying(current, kinds));
    await readDevicePermissionStatuses(kinds, readDevicePermission, (kind, outcome) => {
      if (mounted.current) setReads((current) => ({ ...current, [kind]: outcome }));
    });
  }, []);
  useEffect(() => {
    if (process.env.EXPO_OS === "web") return;
    void runFor("refresh", () => refresh());
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void runFor("refresh", () => refresh());
    });
    return () => listener.remove();
  }, [refresh, runFor]);
  if (process.env.EXPO_OS === "web") return <Body>{copy("Telefon izinlerini mobil uygulamada yönet.", "Manage phone permissions in the mobile app.")}</Body>;
  const status = (read: PermissionRead) => read.status === "pending"
    ? copy("Kontrol ediliyor…", "Checking…")
    : read.status === "error" ? copy("Kontrol edilemedi", "Could not check")
    : read.permission.granted ? copy("İzin verildi", "Allowed")
    : read.permission.canAskAgain ? copy("İzin gerekiyor", "Permission required")
    : copy("Telefon ayarlarından izin ver", "Allow in phone settings");
  const failed = failedPermissionKinds(reads);
  const labels = { camera: copy("Kamera", "Camera"), notifications: copy("Bildirimler", "Notifications") };
  const issues = failed.map((kind) => {
    const read = reads[kind];
    return read.status === "error" ? `${labels[kind]}: ${errorMessage(read.error, copy)}` : undefined;
  });
  const row = (kind: DevicePermissionKind, label: string) => {
    const read = reads[kind];
    return <><NavigationRow label={label} detail={status(read)} detailLines={0} busy={operationTarget === kind && action.isPending}
      disabled={action.isPending || read.status !== "ready"}
      onPress={() => { void runFor(kind, async () => {
        if (read.status === "ready" && read.permission.granted) await Linking.openSettings();
        else await allowDevicePermission(kind);
        await refresh();
      }); }} />{operationTarget === kind ? <MutationState mutation={action} /> : null}</>;
  };
  const notificationsGranted = reads.notifications.status === "ready" && reads.notifications.permission.granted;
  return (
    <Stack>
      <NavigationGroup>
        {row("camera", labels.camera)}
        {row("notifications", labels.notifications)}
      </NavigationGroup>
      <IssueSummary issues={issues} retrying={action.isPending} onRetry={() => { void runFor("refresh", () => refresh(failed)); }} />
      <Disclosure label={copy("Fotoğraflar ve dosyalar", "Photos and files")}>
        <Body muted>{copy("Fotoğraf ve dosyalar için sistem seçicisi açılır; yalnızca seçtiğin öğelere erişilir.", "Photos and files use the system picker; only selected items are accessed.")}</Body>
      </Disclosure>
      <Body muted>{copy("Bildirim izni tek başına bilgisayar bildirimlerini etkinleştirmez. Aşağıdaki deneme bu telefonda yerel bildirim oluşturur.", "Notification permission alone does not enable computer alerts. The test below creates a local notification on this phone.")}</Body>
      <FormActions submitLabel={copy("Bildirimi dene", "Test notification")} disabled={!notificationsGranted || action.isPending}
        busy={action.isPending && operationTarget === "test"} onSubmit={() => { void runFor("test", () => testDeviceNotification("bycoda", copy("Bildirimler bu telefonda çalışıyor.", "Notifications work on this phone."))); }}
        feedback={operationTarget === "test" ? <MutationState mutation={action} /> : null} tone="default" />
      <Button label={copy("Telefon ayarlarını aç", "Open phone settings")} tone="quiet" disabled={action.isPending} busy={action.isPending && operationTarget === "settings"}
        onPress={() => { void runFor("settings", () => Linking.openSettings()); }} />
      {operationTarget === "settings" || operationTarget === "refresh" ? <MutationState mutation={action} /> : null}
    </Stack>
  );
}
