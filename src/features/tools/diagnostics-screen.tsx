import { useState } from "react";
import { Stack as RouterStack } from "expo-router";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { Body, Button, Disclosure, NavigationGroup, QueryState, Screen, Section, Stack, ToggleField } from "@/ui/primitives";
import { MetricRow } from "@/ui/metric-row";
import { useCopy } from "@/ui/copy";
import { usePullRefresh } from "@/ui/use-pull-refresh";
import type { HostProject } from "@/domain/types";
import { memoryLabel, readDiagnostics, type ResourceDiagnostics, type ResourceSample } from "./diagnostics-model";
import { stamp } from "../management/shared/format";

export function DiagnosticsScreen({ project }: { project: HostProject }) {
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
    actions={<Button busy={refresh.refreshing} tone="quiet" label={copy("Yenile", "Refresh")} disabled={query.isFetching} onPress={() => { void refresh.onRefresh(); }} />}>
    <RouterStack.Screen options={{ title: copy("Tanılama", "Diagnostics") }} />
    <QueryState query={query} empty={query.data?.samples.length === 0} emptyTitle={copy("Henüz örnek yok.", "No samples yet.")} />
    <NavigationGroup><ToggleField label={copy("Otomatik yenile", "Auto refresh")} value={autoRefresh} onChange={setAutoRefresh} /></NavigationGroup>
    {sample ? <DiagnosticsDetails sample={sample} /> : <Disclosure label={copy("Ayrıntılar", "Details")}><DiagnosticsScope /></Disclosure>}
  </Screen>;
}

function DiagnosticsScope() {
  const copy = useCopy();
  return <Body muted>{copy("Bilgisayar ve bycoda Node işlemi istek üzerine örneklenir. Sağlayıcı alt işlemleri dahil değildir.", "Computer and bycoda Node process sampled on demand. Provider child processes are excluded.")}</Body>;
}

/** Fixed-field presentation also used by the isolated layout fixture. */
export function DiagnosticsDetails({ sample }: { sample: ResourceSample }) {
  const copy = useCopy();
  return <>
      <Body muted>{stamp(sample.at)}</Body>
      <Section title={copy("Bilgisayar", "Computer")}><Stack>
        <MetricRow label={copy("Toplam bellek", "Total memory")} value={memoryLabel(sample.host.totalMemoryBytes)} />
        <MetricRow label={copy("Boş bellek", "Free memory")} value={memoryLabel(sample.host.freeMemoryBytes)} />
        <MetricRow label={copy("Mantıksal işlemciler", "Logical CPUs")} value={sample.host.logicalCpus} />
      </Stack></Section>
      <Section title={copy("İşlem", "Process")}><Stack>
        <MetricRow label={copy("İşlem belleği", "Process memory")} value={memoryLabel(sample.process.rssBytes)} />
        <MetricRow label={copy("Heap kullanımı", "Heap used")} value={memoryLabel(sample.process.heapUsedBytes)} />
        <MetricRow label={copy("İşlem CPU", "Process CPU")} value={sample.process.cpuPercent === null ? "—" : `${sample.process.cpuPercent.toFixed(1)}%`} />
        <MetricRow label={copy("Çalışma süresi", "Uptime")} value={`${Math.floor(sample.process.uptimeSeconds / 60)} min`} />
        <MetricRow label="PID" value={sample.process.pid} />
      </Stack></Section>
      <Disclosure label={copy("Ayrıntılar", "Details")}>
        <MetricRow label={copy("Harici bellek", "External memory")} value={memoryLabel(sample.process.externalBytes)} />
        <MetricRow label={copy("Yük ortalaması (1 / 5 / 15 dk)", "Load average (1 / 5 / 15 min)")}
          value={sample.host.loadAverage === null ? "—" : sample.host.loadAverage.map((value) => value.toFixed(2)).join(" · ")} />
        <DiagnosticsScope />
      </Disclosure>
    </>;
}
