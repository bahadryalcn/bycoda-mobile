import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { useLocale } from "@/i18n";
import { matchesSearch } from "@/ui/search-matching";
import { Stack } from "expo-router";
import Smartphone from "lucide-react-native/icons/smartphone";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { useConnectionScope, type ConnectionScope } from "@/state/connection-scope";
import { isReviewedMachine, reviewedMachine, type ReviewedMachine } from "@/state/reviewed-machine";
import type { HostProject } from "@/domain/types";
import { ActionMenu, Badge, Body, Disclosure, IconButton, NavigationRow, QueryState, Row, ScreenList, SearchField } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { colors } from "@/ui/tokens";
import { useMobileTheme } from "@/ui/theme";
import { IssueSummary } from "@/ui/issue-summary";
import { usePullRefresh } from "@/ui/use-pull-refresh";
import { deviceAvailabilityIssues } from "./device-availability";
import { PrivateContentAccessProvider, usePrivateContentAccess } from "@/ui/private-access";
import { DeviceViewer } from "./device-viewer";
import { DeviceRuntime } from "./device-runtime";
import type { DeviceHostStatus, DeviceSummary } from "./types";

type DeviceScope = { machineId: string | undefined; projectId: string; reviewed: ReviewedMachine | undefined; connection: ConnectionScope };

export function DevicesScreen({ project }: { project: HostProject }) {
  useMobileTheme();
  const copy = useCopy();
  const locale = useLocale();
  const machine = useActiveMachine();
  const connection = useConnectionScope();
  const parentAccess = usePrivateContentAccess();
  const windowAccess = useMemo(() => ({
    allowed: parentAccess.allowed && connection.isCurrent(),
    check: () => parentAccess.check() && connection.isCurrent(),
  }), [parentAccess, connection]);
  const [search, setSearch] = useState("");
  const searchInput = useRef<ComponentRef<typeof SearchField>>(null);
  const clearSearch = () => { setSearch(""); searchInput.current?.focus(); };
  const [selected, setSelected] = useState<DeviceScope & { device: DeviceSummary }>();
  const [runtime, setRuntime] = useState<DeviceScope>();
  const currentScope = { machineId: machine?.id, projectId: project.id, reviewed: reviewedMachine(machine), connection };
  const isCurrentScope = (scope: DeviceScope) => scope.connection.isCurrent() && scope.projectId === project.id &&
    isReviewedMachine(scope.reviewed, { activeId: machine?.id ?? null, machines: machine ? [machine] : [] });
  useEffect(() => { setSelected(undefined); setRuntime(undefined); }, [connection.token, machine?.id, machine?.endpoint, machine?.environmentId, machine?.lanKey, project.id]);
  const status = useHostQuery<DeviceHostStatus>(["devices", "status"], "devices.status", { projectId: project.id }, { interval: 15_000 });
  const list = useHostQuery<{ devices: DeviceSummary[]; errors: string[] }>(["devices", "list"], "devices.list", { projectId: project.id }, { interval: 15_000 });
  const visible = (list.data?.devices ?? []).filter((device) => matchesSearch([device.name, device.platform, device.version].filter(Boolean).join(" "), search, locale));
  const refresh = usePullRefresh(() => Promise.all([status.refetch(), list.refetch()]));
  const partialErrors = (list.data?.errors ?? []).filter((error) => error.trim());
  const unavailablePlatforms = status.data?.platforms.filter((platform) => !platform.available) ?? [];
  const availabilityIssues = deviceAvailabilityIssues(partialErrors, unavailablePlatforms, copy("Kullanılamıyor", "Unavailable"));
  const availabilityDetails = availabilityIssues.map((issue) => <Body key={issue} muted selectable>{issue}</Body>);
  return (
    <>
    <ScreenList<DeviceSummary>
      title={copy("Cihazlar", "Devices")}
      subtitle={[machine?.name, project.name].filter(Boolean).join(" · ")}
      data={visible}
      keyExtractor={(device) => device.id}
      query={list}
      refreshState={refresh}
      actions={<>
        <IconButton label={copy("Yenile", "Refresh")} busy={refresh.refreshing}
          disabled={status.isFetching || list.isFetching} onPress={() => { void refresh.onRefresh(); }}>
          <RefreshCw size={22} strokeWidth={2} color={colors.accent} />
        </IconButton>
        <ActionMenu label={copy("Diğer işlemler", "More actions")} actions={[
          { key: "service", label: copy("Cihaz servisi", "Device service"), onPress: () => setRuntime(currentScope) },
        ]} />
      </>}
      header={
        <>
          <Stack.Screen options={{ title: copy("Cihazlar", "Devices") }} />
          <SearchField ref={searchInput} label={copy("Cihaz ara", "Search devices")} value={search} onChangeText={setSearch} />
          <QueryState query={status} loading="none" />
          <QueryState
            query={list}
            empty={!visible.length && !partialErrors.length}
            emptyTitle={
              search.trim() && list.data?.devices.length
                ? copy("Eşleşen sonuç yok", "No matching results")
                : copy("Cihaz bulunamadı.", "No devices found.")
            }
            emptyAction={search.trim() && list.data?.devices.length ? {
              label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch,
            } : undefined}
          />
          {partialErrors.length ? <IssueSummary issues={availabilityIssues}
            details={availabilityIssues.length > 1 ? availabilityDetails : undefined}
            retrying={list.isFetching} onRetry={() => {
            if (!list.isFetching) void list.refetch();
          }} /> : unavailablePlatforms.length ? <Disclosure label={copy("Ayrıntılar", "Details")}>
            {availabilityDetails}
          </Disclosure> : null}
        </>
      }
      renderItem={({ item: device }) => <NavigationRow
        label={device.name}
        detail={`${[device.platform, device.version].filter(Boolean).join(" ")} · ${device.physical ? copy("Fiziksel cihaz", "Physical device") : copy("Simülatör", "Simulator")}`}
        detailLines={2}
        accessibilityLabel={[device.name, device.platform, device.version,
          device.physical ? copy("Fiziksel cihaz", "Physical device") : copy("Simülatör", "Simulator"),
          device.booted ? copy("Hazır", "Ready") : copy("Kapalı", "Off")].filter(Boolean).join(". ")}
        icon={<Smartphone size={21} color={device.booted ? colors.live : colors.muted} />}
        supporting={<Row><Badge label={device.booted ? copy("Hazır", "Ready") : copy("Kapalı", "Off")} tone={device.booted ? "active" : "default"} /></Row>}
        onPress={() => setSelected({ ...currentScope, device })}
      />}
    />
    <PrivateContentAccessProvider value={windowAccess}>
    {runtime && isCurrentScope(runtime) ? <DeviceRuntime key={`${runtime.machineId}:${runtime.projectId}`} projectId={runtime.projectId}
      onClose={() => setRuntime((current) => current === runtime ? undefined : current)} /> : null}
    {selected && isCurrentScope(selected) ? <DeviceViewer key={`${selected.machineId}:${selected.projectId}:${selected.device.id}`} projectId={selected.projectId} device={selected.device}
      canControl={status.data?.agentInstalled ?? false}
      onDevice={(device) => setSelected((current) => current === selected ? { ...current, device } : current)}
      onClose={() => setSelected((current) => current === selected ? undefined : current)} /> : null}
    </PrivateContentAccessProvider>
    </>
  );
}
