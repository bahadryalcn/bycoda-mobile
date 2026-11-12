import { useState } from "react";
import { Stack as RouterStack } from "expo-router";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { Meter } from "panelui-native/components/meter";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { Body, Disclosure, IconButton, NavigationGroup, QueryState, Row, Screen, Section, Stack, ToggleField } from "@/ui/primitives";
import { MetricRow } from "@/ui/metric-row";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { usePullRefresh } from "@/ui/use-pull-refresh";
import type { HostProject } from "@/domain/types";
import { memoryLabel, readDiagnostics, type ResourceDiagnostics, type ResourceSample } from "./diagnostics-model";
import { clockLabel, gibibyteLabel, shareOf, uptimeLabel } from "./diagnostics-format";

const REFRESH_ICON_SIZE = 22;
const FULL_SCALE = 100;
const STAT_MIN_WIDTH = 140;
/** The memory bar turns amber, then red, as the computer runs short. */
const MEMORY_THRESHOLDS = [{ from: 75, color: "warning" }, { from: 90, color: "destructive" }] as const;

export function DiagnosticsScreen({ project }: { project: HostProject }) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const query = useHostQuery<ResourceDiagnostics>(["resources"], "resources.read", {}, {
    interval: autoRefresh ? 10_000 : undefined,
    queryFn: async (client, signal) => readDiagnostics(await client.request("resources.read", {}, { signal })),
  });
  const sample = query.data?.samples.at(-1);
  const refresh = usePullRefresh(() => query.refetch());
  return <Screen title={copy("Tanılama", "Diagnostics")} subtitle={`${machine?.name ?? ""} · ${project.name}`}
    query={query}
    refreshState={refresh}
    actions={<IconButton busy={refresh.refreshing} label={copy("Yenile", "Refresh")} disabled={query.isFetching} onPress={() => { void refresh.onRefresh(); }}>
      <RefreshCw size={REFRESH_ICON_SIZE} strokeWidth={2} color={colors.accent} />
    </IconButton>}>
    <RouterStack.Screen options={{ title: copy("Tanılama", "Diagnostics") }} />
    <QueryState query={query} empty={query.data?.samples.length === 0} emptyIllustration="inbox-empty" emptyTitle={copy("Henüz örnek yok.", "No samples yet.")} />
    <NavigationGroup><ToggleField label={copy("Otomatik yenile", "Auto refresh")} value={autoRefresh} onChange={setAutoRefresh} /></NavigationGroup>
    {sample ? <DiagnosticsDetails sample={sample} /> : <Disclosure label={copy("Ayrıntılar", "Details")}><DiagnosticsScope /></Disclosure>}
  </Screen>;
}

function DiagnosticsScope() {
  const copy = useCopy();
  const { uiStyles } = useMobileTheme();
  return <Body muted style={uiStyles.caption}>{copy("Bilgisayar ve bycoda Node işlemi istek üzerine örneklenir. Sağlayıcı alt işlemleri dahil değildir.", "Computer and bycoda Node process sampled on demand. Provider child processes are excluded.")}</Body>;
}

/** One compact reading: a muted label above a monospace value. Wraps in pairs on narrow screens. */
function Stat({ label, value }: { label: string; value: string }) {
  const { uiStyles } = useMobileTheme();
  return <Stack style={{ flexBasis: STAT_MIN_WIDTH, flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
    <Body muted style={uiStyles.caption}>{label}</Body>
    <Body mono style={uiStyles.label}>{value}</Body>
  </Stack>;
}

/** Fixed-field presentation also used by the isolated layout fixture. */
export function DiagnosticsDetails({ sample }: { sample: ResourceSample }) {
  const copy = useCopy();
  const { uiStyles } = useMobileTheme();
  const { host, process } = sample;
  const usedMemory = host.totalMemoryBytes - host.freeMemoryBytes;
  const memoryShare = shareOf(usedMemory, host.totalMemoryBytes);
  const heapShare = shareOf(process.heapUsedBytes, process.rssBytes);
  const uptimeUnits = { hours: copy("sa", "h"), minutes: copy("dk", "min") };
  return <>
      <Body muted style={uiStyles.caption}>{`${copy("Güncellendi", "Updated")} ${clockLabel(sample.at)}`}</Body>
      <Section title={copy("Bilgisayar", "Computer")}><Stack>
        {memoryShare === null ? <MetricRow label={copy("Bellek", "Memory")} value="—" /> : <Meter
          label={copy("Bellek", "Memory")}
          value={memoryShare}
          minValue={0}
          maxValue={FULL_SCALE}
          showValueLabel
          valueLabel={`${gibibyteLabel(usedMemory)} / ${gibibyteLabel(host.totalMemoryBytes)}`}
          thresholds={[...MEMORY_THRESHOLDS]}
        />}
        <Body muted style={uiStyles.caption}>{`${copy("Boş", "Free")}: ${gibibyteLabel(host.freeMemoryBytes)}`}</Body>
        <Row>
          <Stat label={copy("Mantıksal işlemciler", "Logical CPUs")} value={String(host.logicalCpus)} />
        </Row>
      </Stack></Section>
      <Section title={copy("bycoda işlemi", "bycoda process")}><Stack>
        <Row>
          <Stat label={copy("İşlem belleği", "Process memory")} value={memoryLabel(process.rssBytes)} />
          <Stat label={copy("Çalışma süresi", "Uptime")} value={uptimeLabel(process.uptimeSeconds, uptimeUnits)} />
        </Row>
        {heapShare === null ? <MetricRow label={copy("Yığın kullanımı", "Heap used")} value={memoryLabel(process.heapUsedBytes)} /> : <Meter
          label={copy("Yığın kullanımı", "Heap used")}
          value={heapShare}
          minValue={0}
          maxValue={FULL_SCALE}
          showValueLabel
          valueLabel={memoryLabel(process.heapUsedBytes)}
        />}
        {heapShare === null ? null : <Body muted style={uiStyles.caption}>{copy("İşlem belleğine oranla", "Relative to process memory")}</Body>}
        <MetricRow label={copy("İşlem CPU", "Process CPU")} value={process.cpuPercent === null ? "—" : `${process.cpuPercent.toFixed(1)}%`} />
      </Stack></Section>
      <Disclosure label={copy("Ayrıntılar", "Details")}>
        <MetricRow label="PID" value={process.pid} />
        <MetricRow label={copy("Harici bellek", "External memory")} value={memoryLabel(process.externalBytes)} />
        <MetricRow label={copy("Yük ortalaması (1 / 5 / 15 dk)", "Load average (1 / 5 / 15 min)")}
          value={host.loadAverage === null ? "—" : host.loadAverage.map((value) => value.toFixed(2)).join(" · ")} />
        <DiagnosticsScope />
      </Disclosure>
    </>;
}
