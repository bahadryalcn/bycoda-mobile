import { useMemo, useState } from "react";
import { useHostQuery } from "@/state/queries";
import { useConnectionScope } from "@/state/connection-scope";
import { NavigationRow, QueryState, Sheet } from "@/ui/primitives";
import { PrivateContentAccessProvider, usePrivateContentAccess } from "@/ui/private-content";
import { useCopy } from "@/ui/copy";
import { DeviceViewer } from "../tools/device-viewer";
import type { DeviceSummary } from "../tools/types";

/**
 * Live view of the device a session's agent uses. Viewing only: control stays disabled here, and the
 * device list shares the Devices tool's cache. Without a known device id (older Host) it asks which one.
 */
export function SessionDeviceSheet({ projectId, deviceId, onClose }: { projectId: string; deviceId?: string; onClose: () => void }) {
  const copy = useCopy();
  const connection = useConnectionScope();
  const parent = usePrivateContentAccess();
  const [picked, setPicked] = useState<DeviceSummary>();
  const list = useHostQuery<{ devices: DeviceSummary[]; errors: string[] }>(["devices", "list"], "devices.list", { projectId }, {
    enabled: !picked,
    interval: (data) => picked || data?.devices.some((row) => row.id === deviceId) ? false : 15_000,
  });
  const access = useMemo(() => ({ allowed: parent.allowed && connection.isCurrent(), check: () => parent.check() && connection.isCurrent() }), [parent, connection]);
  const devices = list.data?.devices ?? [];
  const device = picked ?? (deviceId ? devices.find((row) => row.id === deviceId) : undefined);
  if (device) {
    return (
      <PrivateContentAccessProvider value={access}>
        <DeviceViewer key={device.id} projectId={projectId} device={device} canControl={false} viewOnly onDevice={setPicked} onClose={onClose} />
      </PrivateContentAccessProvider>
    );
  }
  const booted = devices.filter((row) => row.booted);
  return (
    <Sheet visible title={copy("Cihaz", "Device")} onClose={onClose}>
      <QueryState query={list} empty={booted.length === 0} emptyTitle={copy("Çalışan cihaz yok", "No device is running")} />
      {booted.map((row) => <NavigationRow key={row.id} label={row.name} detail={[row.platform, row.version].filter(Boolean).join(" ")} onPress={() => setPicked(row)} />)}
    </Sheet>
  );
}
