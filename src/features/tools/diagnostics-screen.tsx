import { useState } from "react";
import { Stack as RouterStack } from "expo-router";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { Meter } from "panelui-native/components/meter";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { Body, Disclosure, IconButton, NavigationGroup, QueryState, Screen, Section, ToggleField, ValueRow } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { iconSize } from "@/ui/tokens";
import { usePullRefresh } from "@/ui/use-pull-refresh";
import { memoryLabel, readDiagnostics, type ResourceDiagnostics, type ResourceSample } from "./diagnostics-model";
import { toolLabels } from "./tool-labels";
import { clockLabel, gibibyteLabel, shareOf, uptimeLabel } from "./diagnostics-format";

const AUTO_REFRESH_MS = 10_000;
const FULL_SCALE = 100;
/**
 * One rule for every capacity bar: the accent colour while there is headroom, amber from 80% and
 * red from 90%. Only shares of a capacity (computer memory, CPU) get a bar; sizes and counts do not.
 */
export const CAPACITY_THRESHOLDS = [{ from: 80, color: "warning" }, { from: 90, color: "destructive" }] as const;

/** Computer and bycoda process resources. Computer-level: the page names only the computer. */
export function DiagnosticsScreen() {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const query = useHostQuery<ResourceDiagnostics>(["resources"], "resources.read", {}, {
    interval: autoRefresh ? AUTO_REFRESH_MS : undefined,
    queryFn: async (client, signal) => readDiagnostics(await client.request("resources.read", {}, { signal })),
  });
  const sample = query.data?.samples.at(-1);
  const refresh = usePullRefresh(() => query.refetch());
  return <Screen title={copy(...toolLabels.diagnostics)} computerSwitch scope={{ computer: machine?.name }}
    subtitle={sample ? `${copy("Güncellendi", "Updated")} ${clockLabel(sample.at)}` : undefined}
    query={query}
    refreshState={refresh}
    actions={<IconButton busy={refresh.refreshing} label={copy("Yenile", "Refresh")} disabled={query.isFetching} onPress={() => { void refresh.onRefresh(); }}>
      <RefreshCw size={iconSize.action} strokeWidth={2} color={colors.accent} />
    </IconButton>}>
    <RouterStack.Screen options={{ title: copy(...toolLabels.diagnostics) }} />
    <NavigationGroup>
      <ToggleField label={copy("Otomatik yenile", "Auto refresh")} detail={copy("10 saniyede bir", "Every 10 seconds")}
        value={autoRefresh} onChange={setAutoRefresh} />
    </NavigationGroup>
    <QueryState size="region" query={query} empty={query.data?.samples.length === 0} emptyIllustration="inbox-empty" emptyTitle={copy("Henüz örnek yok.", "No samples yet.")} />
    {sample ? <DiagnosticsDetails sample={sample} /> : <DiagnosticsScope />}
  </Screen>;
}

function DiagnosticsScope() {
  const copy = useCopy();
  const { uiStyles } = useMobileTheme();
  return <Body muted style={uiStyles.caption}>{copy(
    "Bilgisayar ve bycoda Node işlemi istek üzerine örneklenir; sağlayıcı alt işlemleri dahil değildir. Çubuklar %80’de sarıya, %90’da kırmızıya döner.",
    "Computer and bycoda Node process sampled on demand; provider child processes are excluded. Bars turn amber at 80% and red at 90%.",
  )}</Body>;
}

/** A share-of-capacity bar under a metric row; the row already names and reads the value. */
function CapacityBar({ share, label }: { share: number; label: string }) {
  return <Meter value={share} minValue={0} maxValue={FULL_SCALE} size="sm" accessibilityLabel={label} thresholds={[...CAPACITY_THRESHOLDS]} />;
}

const percentLabel = (value: number) => `${value.toFixed(1)}%`;

/**
 * Every reading is the same row: label left, value right, an optional capacity bar under it.
 * Unknown readings are left out rather than shown as a dash.
 */
export function DiagnosticsDetails({ sample }: { sample: ResourceSample }) {
  const copy = useCopy();
  const { host, process } = sample;
  const usedMemory = host.totalMemoryBytes - host.freeMemoryBytes;
  const memoryShare = shareOf(usedMemory, host.totalMemoryBytes);
  const uptimeUnits = { hours: copy("sa", "h"), minutes: copy("dk", "min") };
  const memory = copy("Bellek", "Memory");
  const cpu = copy("İşlem CPU", "Process CPU");
  return <>
    <Section title={copy("Bilgisayar", "Computer")}>
      <NavigationGroup>
        <ValueRow label={memory} value={memoryShare === null ? undefined
          : `${gibibyteLabel(usedMemory)} / ${gibibyteLabel(host.totalMemoryBytes)}`}>
          {memoryShare === null ? null : <CapacityBar share={memoryShare} label={memory} />}
        </ValueRow>
        <ValueRow label={copy("Mantıksal işlemciler", "Logical CPUs")} value={String(host.logicalCpus)} />
        {host.loadAverage ? <ValueRow label={copy("Yük ortalaması (1 / 5 / 15 dk)", "Load average (1 / 5 / 15 min)")}
          value={host.loadAverage.map((value) => value.toFixed(2)).join(" · ")} /> : null}
      </NavigationGroup>
    </Section>
    <Section title={copy("bycoda işlemi", "bycoda process")}>
      <NavigationGroup>
        {process.cpuPercent === null ? null : <ValueRow label={cpu} value={percentLabel(process.cpuPercent)}>
          <CapacityBar share={Math.min(FULL_SCALE, process.cpuPercent)} label={cpu} />
        </ValueRow>}
        <ValueRow label={copy("İşlem belleği", "Process memory")} value={memoryLabel(process.rssBytes)} />
        <ValueRow label={copy("Yığın kullanımı", "Heap used")} value={memoryLabel(process.heapUsedBytes)} />
        <ValueRow label={copy("Çalışma süresi", "Uptime")} value={uptimeLabel(process.uptimeSeconds, uptimeUnits)} />
      </NavigationGroup>
    </Section>
    <Disclosure label={copy("Teknik ayrıntılar", "Technical details")}>
      <NavigationGroup>
        <ValueRow label="PID" value={String(process.pid)} />
        <ValueRow label={copy("Harici bellek", "External memory")} value={memoryLabel(process.externalBytes)} />
      </NavigationGroup>
    </Disclosure>
    <DiagnosticsScope />
  </>;
}
