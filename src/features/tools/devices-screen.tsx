import { Smartphone } from "@/ui/duotone-icon";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { useLocale } from "@/i18n";
import { matchesSearch } from "@/ui/search-matching";
import { Stack } from "expo-router";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import Wrench from "lucide-react-native/icons/wrench";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { useConnectionScope, type ConnectionScope } from "@/state/connection-scope";
import { isReviewedMachine, reviewedMachine, type ReviewedMachine } from "@/state/reviewed-machine";
import type { HostProject } from "@/domain/types";
import { Body, Disclosure, Row, IconButton, NavigationRow, QueryState, RowIcon, ScreenList, SearchField, StatusText } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { iconSize } from "@/ui/tokens";
import { IssueSummary } from "@/ui/issue-summary";
import { usePullRefresh } from "@/ui/use-pull-refresh";
import { deviceAvailabilityIssues } from "./device-availability";
import { PrivateContentAccessProvider, usePrivateContentAccess } from "@/ui/private-access";
import { DeviceViewer } from "./device-viewer";
import { deviceSystemLabel } from "./device-system";
import { DeviceRuntime } from "./device-runtime";
import type { DeviceHostStatus, DeviceSummary } from "./types";

type DeviceScope = { machineId: string | undefined; projectId: string; reviewed: ReviewedMachine | undefined; connection: ConnectionScope };

export function DevicesScreen({ project }: { project: HostProject }) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const locale = useLocale();
  const machine = useActiveMachine();
  const connection = useConnectionScope();
  const parentAccess = usePrivateContentAccess();
  const allowed = parentAccess.allowed && connection.isCurrent();
  const windowAccess = useMemo(() => ({
    allowed,
    check: () => parentAccess.check() && connection.isCurrent(),
  }), [parentAccess, connection, allowed]);
  const [search, setSearch] = useState("");
  const searchInput = useRef<ComponentRef<typeof SearchField>>(null);
  const clearSearch = () => { setSearch(""); searchInput.current?.focus(); };
  const [selected, setSelected] = useState<DeviceScope & { device: DeviceSummary }>();
  const [runtime, setRuntime] = useState<DeviceScope>();
  const currentScope = { machineId: machine?.id, projectId: project.id, reviewed: reviewedMachine(machine), connection };
  const isCurrentScope = (scope: DeviceScope) => scope.connection.isCurrent() && scope.projectId === project.id &&
    isReviewedMachine(scope.reviewed, { activeId: machine?.id ?? null, machines: machine ? [machine] : [] });
  // Devices whose start request is open or unanswered: shown as starting until the list says otherwise.
  const [starting, setStarting] = useState<ReadonlySet<string>>(new Set());
  const startTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // A new connection or project must not inherit pending starts from a previous scope.
  useEffect(() => {
    setSelected(undefined);
    setRuntime(undefined);
    setStarting(new Set());
    const timers = startTimers.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, [connection.token, machine?.id, machine?.endpoint, machine?.environmentId, machine?.lanKey, project.id]);
  const onBootChange = (deviceId: string, state: "pending" | "done" | "failed") => {
    if (!connection.isCurrent()) return;
    const timers = startTimers.current;
    clearTimeout(timers.get(deviceId));
    timers.delete(deviceId);
    if (state === "done") setStarting((previous) => { const next = new Set(previous); next.delete(deviceId); return next; });
    else setStarting((previous) => new Set(previous).add(deviceId));
    // A start that never answered is reconciled by the refreshed list; stop waiting after a while.
    if (state === "failed") timers.set(deviceId, setTimeout(() => {
      setStarting((previous) => { const next = new Set(previous); next.delete(deviceId); return next; });
    }, 60_000));
    if (state !== "pending") refetchListing();
  };
  const listingInterval = starting.size ? 4_000 : selected || runtime ? undefined : 15_000;
  const status = useHostQuery<DeviceHostStatus>(["devices", "status"], "devices.status", { projectId: project.id }, { interval: listingInterval });
  const list = useHostQuery<{ devices: DeviceSummary[]; errors: string[] }>(["devices", "list"], "devices.list", { projectId: project.id }, { interval: listingInterval });
  const refetchListing = () => { void Promise.all([status.refetch(), list.refetch()]).catch(() => undefined); };
  useEffect(() => {
    const devices = list.data?.devices;
    if (!devices) return;
    setStarting((previous) => {
      const next = new Set([...previous].filter((id) => !devices.find((device) => device.id === id)?.booted));
      return next.size === previous.size ? previous : next;
    });
    setSelected((current) => {
      const fresh = current && devices.find((device) => device.id === current.device.id);
      return fresh && fresh.booted !== current.device.booted ? { ...current, device: fresh } : current;
    });
  }, [list.data]);
  const visible = (list.data?.devices ?? []).filter((device) => matchesSearch([device.name, device.platform, device.version].filter(Boolean).join(" "), search, locale));
  const refresh = usePullRefresh(() => Promise.all([status.refetch(), list.refetch()]));
  const partialErrors = (list.data?.errors ?? []).filter((error) => error.trim());
  const platforms = status.data?.platforms ?? [];
  const unavailablePlatforms = platforms.filter((platform) => !platform.available);
  const noPlatformAvailable = platforms.length > 0 && unavailablePlatforms.length === platforms.length;
  const filtering = !!search.trim() && (list.data?.devices.length ?? 0) > 0;
  const availabilityIssues = deviceAvailabilityIssues(partialErrors, unavailablePlatforms, copy("Kullanılamıyor", "Unavailable"));
  const availabilityDetails = availabilityIssues.map((issue) => <Body key={issue} muted selectable>{issue}</Body>);
  return (
    <>
    <ScreenList<DeviceSummary>
      title={copy("Cihazlar", "Devices")}
      scope={{ computer: machine?.name, project: project.name }}
      data={visible}
      keyExtractor={(device) => device.id}
      query={list}
      refreshState={refresh}
      actions={<>
        <IconButton label={copy("Yenile", "Refresh")} busy={refresh.refreshing}
          disabled={status.isFetching || list.isFetching} onPress={() => { void refresh.onRefresh(); }}>
          <RefreshCw size={iconSize.action} strokeWidth={2} color={colors.accent} />
        </IconButton>
        <IconButton label={copy("Cihaz servisi", "Device service")} onPress={() => setRuntime(currentScope)}>
          <Wrench size={iconSize.action} strokeWidth={2} color={colors.muted} />
        </IconButton>
      </>}
      header={
        <>
          <Stack.Screen options={{ title: copy("Cihazlar", "Devices") }} />
          <SearchField ref={searchInput} label={copy("Cihaz ara", "Search devices")} value={search} onChangeText={setSearch} />
          <QueryState query={status} loading="none" />
          {partialErrors.length ? <IssueSummary issues={availabilityIssues}
            details={availabilityIssues.length > 1 ? availabilityDetails : undefined}
            retrying={list.isFetching} onRetry={() => {
            if (!list.isFetching) void list.refetch();
          }} /> : unavailablePlatforms.length ? <Disclosure label={copy("Kullanılamayan platformlar", "Unavailable platforms")}>
            {availabilityDetails}
          </Disclosure> : null}
        </>
      }
      ListEmptyComponent={
        <QueryState size="region" emptyIllustration="inbox-empty"
          query={list}
        empty={!visible.length && !partialErrors.length}
        emptyTitle={
          filtering
            ? copy("Eşleşen sonuç yok", "No matching results")
            : noPlatformAvailable
              ? copy("Bu bilgisayarda cihazlar listelenemiyor.", "Devices can't be listed on this computer.")
              : copy("Cihaz bulunamadı.", "No devices found.")
        }
        emptyDetail={filtering || noPlatformAvailable ? undefined
          : copy("Bilgisayarda bir simülatör başlatın veya cihaz bağlayın, sonra yenileyin.", "Start a simulator or connect a device on this computer, then refresh.")}
        emptyAction={filtering ? {
          label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch,
        } : { label: copy("Cihaz servisi", "Device service"), onPress: () => setRuntime(currentScope) }}
          />
      }
      renderItem={({ item: device }) => {
        const kind = device.physical ? copy("Fiziksel cihaz", "Physical device") : copy("Simülatör", "Simulator");
        const state = device.booted ? copy("Hazır", "Ready") : starting.has(device.id) ? copy("Başlatılıyor", "Starting") : copy("Kapalı", "Off");
        const system = deviceSystemLabel(device);
        // Identity on the first lines, state as quiet status text that wraps with the type so large text never clips.
        return <NavigationRow
          label={device.name}
          labelLines={2}
          detail={system || undefined}
          detailLines={2}
          supporting={<Row>
            <StatusText label={state} tone={device.booted ? "live" : starting.has(device.id) ? "active" : "default"} />
            <Body muted style={[uiStyles.caption, { flexShrink: 1 }]}>{kind}</Body>
          </Row>}
          accessibilityLabel={[device.name, system, kind, state].filter(Boolean).join(". ")}
          icon={<RowIcon glyph={Smartphone} />}
          onPress={() => setSelected({ ...currentScope, device })}
        />;
      }}
    />
    <PrivateContentAccessProvider value={windowAccess}>
    {runtime && isCurrentScope(runtime) ? <DeviceRuntime key={`${runtime.machineId}:${runtime.projectId}`} projectId={runtime.projectId}
      onClose={() => { setRuntime((current) => current === runtime ? undefined : current); refetchListing(); }} /> : null}
    {selected && isCurrentScope(selected) ? <DeviceViewer key={`${selected.machineId}:${selected.projectId}:${selected.device.id}`} projectId={selected.projectId} device={selected.device}
      canControl={status.data?.agentInstalled ?? false}
      starting={starting.has(selected.device.id)}
      onBootChange={onBootChange}
      onDevice={(device) => setSelected((current) => current === selected ? { ...current, device } : current)}
      onClose={() => { setSelected((current) => current === selected ? undefined : current); refetchListing(); }} /> : null}
    </PrivateContentAccessProvider>
    </>
  );
}
