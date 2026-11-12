import { useState } from "react";
import { View } from "react-native";
import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import { Body, Card, QueryState, SectionHeader, SelectField } from "@/ui/primitives";
import { MetricRow } from "@/ui/metric-row";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { DailyBars } from "@/ui/usage-meters";
import { compactTokens } from "./usage-breakdown";
import { UsageKpis } from "./usage-charts";
import { compactMoney, readCostReport, type CostReport } from "./usage-limits-model";

const PROVIDER_NAMES: Record<string, string> = { claude: "Claude", codex: "Codex" };

/** Estimated API-equivalent cost of the provider logs on the Host: totals, breakdowns and a daily trend. */
export function UsageCost() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const [days, setDays] = useState("7");
  const supported = !!machine?.capabilities?.includes("usage.cost.read") && !!machine.environmentId;
  // The Host buckets days in the phone's local time zone.
  const utcOffsetMinutes = -new Date().getTimezoneOffset();
  const params = { days: Number(days), utcOffsetMinutes };
  const query = useHostQuery<CostReport>(["usage-cost", days, utcOffsetMinutes], "usage.cost.read", params, {
    enabled: supported,
    queryFn: async (client, signal) => readCostReport(await client.request("usage.cost.read", params, { signal }), machine!.environmentId!),
  });
  const report = query.data;
  const empty = !!report && report.totals.tokens === 0;
  return (
    <View style={{ gap: space.md }}>
      <SelectField
        label={copy("Zaman aralığı", "Time range")}
        value={days}
        disabled={query.isFetching}
        options={[
          { value: "7", label: copy("Son 7 gün", "Last 7 days") },
          { value: "30", label: copy("Son 30 gün", "Last 30 days") },
          { value: "90", label: copy("Son 90 gün", "Last 90 days") },
        ]}
        onChange={setDays}
      />
      <QueryState query={query} empty={query.isSuccess && empty} emptyTitle={copy("Bu aralıkta kullanım yok.", "No usage in this period.")} />
      {report && !empty ? (
        <>
          <UsageKpis
            items={[
              { title: copy("Tahmini maliyet", "Estimated cost"), value: compactMoney(report.totals.costUsd) },
              { title: copy("Token", "Tokens"), value: compactTokens(report.totals.tokens) },
              { title: copy("Etkin gün", "Active days"), value: String(report.totals.activeDays) },
            ]}
          />
          <Card variant="surface">
            <DailyBars
              label={copy("Günlük maliyet", "Daily cost")}
              data={report.daily.map((day) => ({ day: day.date.slice(5), value: day.costUsd }))}
            />
          </Card>
          <Breakdown title={copy("Sağlayıcıya göre", "By provider")} rows={report.providers.map((row) => ({ key: row.provider, label: PROVIDER_NAMES[row.provider] ?? row.provider, ...row }))} />
          <Breakdown title={copy("Modele göre", "By model")} rows={report.models.map((row) => ({ key: `${row.provider}:${row.model}`, label: row.model, ...row }))} />
          <Breakdown title={copy("Projeye göre", "By project")} rows={report.projects.map((row) => ({ ...row, key: row.label, label: row.label || copy("Bilinmeyen klasör", "Unknown folder") }))} />
          {report.coverage.unpricedModels.length ? (
            <Body muted>{copy("Fiyatı bilinmeyen modeller yalnızca token olarak sayılır: {p0}", "Models without a price are counted in tokens only: {p0}", { p0: report.coverage.unpricedModels.join(", ") })}</Body>
          ) : null}
          <Body muted>{copy("Liste fiyatlarıyla tahmindir; abonelik faturası değildir.", "Estimated at list prices; not a subscription bill.")}</Body>
        </>
      ) : null}
    </View>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { key: string; label: string; costUsd: number; tokens: number }[] }) {
  if (!rows.length) return null;
  return (
    <View style={{ gap: space.sm }}>
      <SectionHeader title={title} count={rows.length} />
      {rows.map((row) => (
        <MetricRow key={row.key} label={row.label} value={`${compactMoney(row.costUsd)} · ${compactTokens(row.tokens)}`} />
      ))}
    </View>
  );
}
