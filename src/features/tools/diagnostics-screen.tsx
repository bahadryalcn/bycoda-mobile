import { useState } from "react";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { Body, Button, Disclosure, NavigationGroup, Notice, QueryState, Row, Screen, Section, Stack, ToggleField } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
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
  return <Screen title={copy("Tanılama", "Diagnostics")} subtitle={`${machine?.name ?? ""} · ${project.name}`}
    actions={<Button busy={query.isFetching} tone="quiet" label={copy("Yenile", "Refresh")} disabled={query.isFetching} onPress={() => { void query.refetch(); }} />}>
    <QueryState query={query} />
    <NavigationGroup><ToggleField label={copy("Otomatik yenile", "Auto refresh")} value={autoRefresh} onChange={setAutoRefresh} /></NavigationGroup>
    {sample ? <DiagnosticsDetails sample={sample} /> : <DiagnosticsScope />}
  </Screen>;
}

function DiagnosticsScope() {
  const copy = useCopy();
  return <Notice message={copy("Bilgisayar ve bycoda Node işlemi istek üzerine örneklenir. Sağlayıcı alt işlemleri dahil değildir.", "Computer and bycoda Node process sampled on demand. Provider child processes are excluded.")} />;
}

/** Fixed-field presentation also used by the isolated layout fixture. */
export function DiagnosticsDetails({ sample }: { sample: ResourceSample }) {
  const copy = useCopy();
  return <>
      <Body muted>{stamp(sample.at)}</Body>
      <Section title={copy("Bilgisayar", "Computer")}><Stack>
        <Row><Body style={{ flex: 1 }}>{copy("Toplam bellek", "Total memory")}</Body><Body mono>{memoryLabel(sample.host.totalMemoryBytes)}</Body></Row>
        <Row><Body style={{ flex: 1 }}>{copy("Boş bellek", "Free memory")}</Body><Body mono>{memoryLabel(sample.host.freeMemoryBytes)}</Body></Row>
        <Row><Body style={{ flex: 1 }}>{copy("Mantıksal işlemciler", "Logical CPUs")}</Body><Body mono>{sample.host.logicalCpus}</Body></Row>
      </Stack></Section>
      <Section title={copy("İşlem", "Process")}><Stack>
        <Row><Body style={{ flex: 1 }}>{copy("İşlem belleği", "Process memory")}</Body><Body mono>{memoryLabel(sample.process.rssBytes)}</Body></Row>
        <Row><Body style={{ flex: 1 }}>{copy("Heap kullanımı", "Heap used")}</Body><Body mono>{memoryLabel(sample.process.heapUsedBytes)}</Body></Row>
        <Row><Body style={{ flex: 1 }}>{copy("İşlem CPU", "Process CPU")}</Body><Body mono>{sample.process.cpuPercent === null ? "—" : `${sample.process.cpuPercent.toFixed(1)}%`}</Body></Row>
        <Row><Body style={{ flex: 1 }}>{copy("Çalışma süresi", "Uptime")}</Body><Body mono>{Math.floor(sample.process.uptimeSeconds / 60)} min</Body></Row>
        <Row><Body style={{ flex: 1 }}>PID</Body><Body mono>{sample.process.pid}</Body></Row>
      </Stack></Section>
      <Disclosure label={copy("Ayrıntılar", "Details")}><DiagnosticsScope /></Disclosure>
    </>;
}
