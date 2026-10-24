import { useState } from "react";
import { Stack } from "expo-router";
import Smartphone from "lucide-react-native/icons/smartphone";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import type { HostProject } from "@/domain/types";
import { Badge, Button, NavigationRow, Notice, QueryState, ScreenList, SearchField } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { colors } from "@/ui/tokens";
import { useMobileTheme } from "@/ui/theme";
import { DeviceViewer } from "./device-viewer";
import { DeviceRuntime } from "./device-runtime";
import type { DeviceHostStatus, DeviceSummary } from "./types";

export function DevicesScreen({ project }: { project: HostProject }) {
  useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DeviceSummary>();
  const [runtime, setRuntime] = useState(false);
  const status = useHostQuery<DeviceHostStatus>(["devices", "status"], "devices.status", { projectId: project.id }, { interval: 15_000 });
  const list = useHostQuery<{ devices: DeviceSummary[]; errors: string[] }>(["devices", "list"], "devices.list", { projectId: project.id }, { interval: 15_000 });
  const visible = (list.data?.devices ?? []).filter((device) => `${device.name} ${device.platform} ${device.version}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return (
    <ScreenList<DeviceSummary>
      title={copy("Cihazlar", "Devices")}
      subtitle={[machine?.name, project.name].filter(Boolean).join(" · ")}
      data={visible}
      keyExtractor={(device) => device.id}
      query={list}
      header={
        <>
          <Stack.Screen options={{ title: copy("Cihazlar", "Devices") }} />
          <SearchField label={copy("Cihaz ara", "Search devices")} value={search} onChangeText={setSearch} />
          <Button label={copy("Cihaz servisi", "Device service")} tone="quiet" onPress={() => setRuntime(true)} />
          {runtime ? <DeviceRuntime key={`${machine?.id}:${project.id}`} projectId={project.id} onClose={() => setRuntime(false)} /> : null}
          <QueryState query={status} loading="none" />
          <QueryState query={list} empty={!visible.length} emptyTitle={copy("Cihaz bulunamadı.", "No devices found.")} />
          {status.data?.platforms.filter((platform) => !platform.available && platform.reason).map((platform) => <Notice key={platform.platform} tone="warning" message={`${platform.platform}: ${platform.reason}`} />)}
          {list.data?.errors.map((error, index) => <Notice key={index} tone="warning" message={error} />)}
          {selected ? <DeviceViewer key={`${machine?.id}:${project.id}:${selected.id}`} projectId={project.id} device={selected} canControl={status.data?.agentInstalled ?? false} onDevice={setSelected} onClose={() => setSelected(undefined)} /> : null}
        </>
      }
      renderItem={({ item: device }) => <NavigationRow
        label={device.name}
        detail={`${device.platform} ${device.version} · ${device.physical ? copy("Fiziksel cihaz", "Physical device") : copy("Simülatör", "Simulator")}`}
        icon={<Smartphone size={21} color={device.booted ? colors.live : colors.muted} />}
        trailing={<Badge label={device.booted ? copy("Hazır", "Ready") : copy("Kapalı", "Off")} tone={device.booted ? "active" : "default"} />}
        onPress={() => setSelected(device)}
      />}
    />
  );
}
