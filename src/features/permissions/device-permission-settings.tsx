import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import { useAsyncAction } from "@/state/actions";
import { Body, Button, Disclosure, ErrorText, FormActions, MutationState, NavigationGroup, NavigationRow, Notice, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { allowDevicePermission, readDevicePermission, testDeviceNotification, type DevicePermissionKind } from "./device-permissions";
import { failedPermissionKinds, markRetrying, pendingPermissionReads, permissionKinds, readDevicePermissionStatuses,
  type PermissionRead, type PermissionReads } from "./device-permission-status";

export function DevicePermissionSettings() {
  const copy = useCopy();
  const action = useAsyncAction();
  const [reads, setReads] = useState<PermissionReads>(pendingPermissionReads);
  const mounted = useRef(true);
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
    void action.run(() => refresh());
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void action.run(() => refresh());
    });
    return () => listener.remove();
  }, [refresh, action.run]);
  if (process.env.EXPO_OS === "web") return <Body>{copy("Telefon izinlerini mobil uygulamada yönet.", "Manage phone permissions in the mobile app.")}</Body>;
  const status = (read: PermissionRead) => read.status === "pending"
    ? copy("Kontrol ediliyor…", "Checking…")
    : read.status === "error" ? copy("Kontrol edilemedi", "Could not check")
    : read.permission.granted ? copy("İzin verildi", "Allowed")
    : read.permission.canAskAgain ? copy("İzin gerekiyor", "Permission required")
    : copy("Telefon ayarlarından izin ver", "Allow in phone settings");
  const failed = failedPermissionKinds(reads);
  const failure = failed.map((kind) => reads[kind]).find((read) => read.status === "error");
  const row = (kind: DevicePermissionKind, label: string) => {
    const read = reads[kind];
    return <NavigationRow label={label} detail={status(read)}
      disabled={action.isPending || read.status !== "ready"}
      onPress={() => { void action.run(async () => {
        if (read.status === "ready" && read.permission.granted) await Linking.openSettings();
        else await allowDevicePermission(kind);
        await refresh();
      }); }} />;
  };
  const notificationsGranted = reads.notifications.status === "ready" && reads.notifications.permission.granted;
  return (
    <Stack>
      <NavigationGroup>
        {row("camera", copy("Kamera", "Camera"))}
        {row("notifications", copy("Bildirimler", "Notifications"))}
      </NavigationGroup>
      {failed.length ? <Notice tone="warning" retrying={action.isPending} onRetry={() => { void action.run(() => refresh(failed)); }}
        message={copy("Bazı izin durumları kontrol edilemedi. Diğer izinler kullanılabilir.", "Some permission statuses could not be checked. The others stay available.")}>
        <ErrorText error={failure?.status === "error" ? failure.error : undefined} />
      </Notice> : null}
      <Disclosure label={copy("Fotoğraflar ve dosyalar", "Photos and files")}>
        <Body muted>{copy("Fotoğraf ve dosyalar için sistem seçicisi açılır; yalnızca seçtiğin öğelere erişilir.", "Photos and files use the system picker; only selected items are accessed.")}</Body>
      </Disclosure>
      <Body muted>{copy("Bildirim izni tek başına bilgisayar bildirimlerini etkinleştirmez. Aşağıdaki deneme bu telefonda yerel bildirim oluşturur.", "Notification permission alone does not enable computer alerts. The test below creates a local notification on this phone.")}</Body>
      <FormActions submitLabel={copy("Bildirimi dene", "Test notification")} disabled={!notificationsGranted}
        busy={action.isPending} onSubmit={() => { void action.run(() => testDeviceNotification("bycoda", copy("Bildirimler bu telefonda çalışıyor.", "Notifications work on this phone."))); }}
        feedback={<MutationState mutation={action} />} tone="default" />
      <Button label={copy("Telefon ayarlarını aç", "Open phone settings")} tone="quiet"
        onPress={() => { void action.run(() => Linking.openSettings()); }} />
    </Stack>
  );
}
