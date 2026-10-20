import { useCallback, useEffect, useState } from "react";
import { AppState, Linking } from "react-native";
import { useAsyncAction } from "@/state/actions";
import { Body, Button, MutationState, NavigationGroup, NavigationRow, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { allowDevicePermission, readDevicePermission, testDeviceNotification } from "./device-permissions";
import type { DevicePermission } from "./permission-flow";

export function DevicePermissionSettings() {
  const copy = useCopy();
  const action = useAsyncAction();
  const [permissions, setPermissions] = useState<{ camera: DevicePermission; notifications: DevicePermission } | null>(null);
  const refresh = useCallback(async () => {
    const [camera, notifications] = await Promise.all([readDevicePermission("camera"), readDevicePermission("notifications")]);
    setPermissions({ camera, notifications });
  }, []);
  useEffect(() => {
    if (process.env.EXPO_OS === "web") return;
    void action.run(refresh);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void action.run(refresh);
    });
    return () => listener.remove();
  }, [refresh, action.run]);
  if (process.env.EXPO_OS === "web") return <Body>{copy("Telefon izinlerini mobil uygulamada yönet.", "Manage phone permissions in the mobile app.")}</Body>;
  const status = (permission: DevicePermission | undefined) => !permission
    ? copy("Kontrol ediliyor…", "Checking…")
    : permission.granted ? copy("İzin verildi", "Allowed")
    : permission.canAskAgain ? copy("İzin gerekiyor", "Permission required")
    : copy("Telefon ayarlarından izin ver", "Allow in phone settings");
  return (
    <Stack>
      <NavigationGroup>
        <NavigationRow label={copy("Kamera", "Camera")} detail={status(permissions?.camera)}
          disabled={action.isPending || !permissions}
          onPress={() => { void action.run(async () => {
            if (permissions?.camera.granted) await Linking.openSettings();
            else await allowDevicePermission("camera");
            await refresh();
          }); }} />
        <NavigationRow label={copy("Bildirimler", "Notifications")} detail={status(permissions?.notifications)}
          disabled={action.isPending || !permissions}
          onPress={() => { void action.run(async () => {
            if (permissions?.notifications.granted) await Linking.openSettings();
            else await allowDevicePermission("notifications");
            await refresh();
          }); }} />
      </NavigationGroup>
      <Body muted>{copy("Fotoğraf ve dosyalar için sistem seçicisi açılır; yalnızca seçtiğin öğelere erişilir.", "Photos and files use the system picker; only selected items are accessed.")}</Body>
      <Body muted>{copy("Bildirim izni tek başına bilgisayar bildirimlerini etkinleştirmez. Aşağıdaki deneme bu telefonda yerel bildirim oluşturur.", "Notification permission alone does not enable computer alerts. The test below creates a local notification on this phone.")}</Body>
      <Button label={copy("Bildirimi dene", "Test notification")} disabled={!permissions?.notifications.granted}
        busy={action.isPending} onPress={() => { void action.run(() => testDeviceNotification("bycoda", copy("Bildirimler bu telefonda çalışıyor.", "Notifications work on this phone."))); }} />
      <Button label={copy("Telefon ayarlarını aç", "Open phone settings")} tone="quiet"
        onPress={() => { void action.run(() => Linking.openSettings()); }} />
      <MutationState mutation={action} />
    </Stack>
  );
}
