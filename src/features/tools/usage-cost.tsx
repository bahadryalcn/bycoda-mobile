import { useState } from "react";
import { providerName } from "../workspace/provider-choices";
import { View } from "react-native";
import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import { useLocale } from "@/i18n";
import { Body, Card, QueryState, SectionHeader, SegmentedControl } from "@/ui/primitives";
import { MetricRow } from "@/ui/metric-row";
import { useCopy } from "@/ui/copy";
import { useInfoHint } from "@/ui/info-hint";
import { space } from "@/ui/tokens";
import { DailyBars } from "@/ui/usage-meters";
import { compactTokens } from "./usage-breakdown";
import { UsageKpis } from "./usage-charts";
import { compactMoney, readCostReport, type CostReport } from "./usage-limits-model";

/** Estimated API-equivalent cost of the provider logs on the Host: totals, breakdowns and a daily trend. */
export function UsageCost() {
  const copy = useCopy();
  const locale = useLocale();
  const machine = useActiveMachine();
  const [days, setDays] = useState("7");
  const info = useInfoHint(copy("Liste fiyatlarıyla tahmindir; abonelik faturası değildir.", "Estimated at list prices; not a subscription bill."));
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
  const peak = report?.daily.reduce<CostReport["daily"][number] | undefined>(
    (best, day) => (day.costUsd > (best?.costUsd ?? 0) ? day : best), undefined);
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <SegmentedControl
            hideLabel
            label={copy("Zaman aralığı", "Time range")}
            value={days}
            disabled={query.isFetching}
            options={[
              { value: "7", label: copy("7 gün", "7 days") },
              { value: "30", label: copy("30 gün", "30 days") },
              { value: "90", label: copy("90 gün", "90 days") },
            ]}
            onChange={setDays}
          />
        </View>
        <View style={{ minHeight: 48, justifyContent: "center" }}>{info.button}</View>
      </View>
      {info.panel}
      <QueryState query={query} empty={query.isSuccess && empty} emptyTitle={copy("Bu aralıkta kullanım yok.", "No usage in this period.")} />
      {report && !empty ? (
        <>
          <UsageKpis
            items={[
              { title: copy("Tahmini maliyet · son {p0} gün", "Estimated cost · last {p0} days", { p0: days }), value: compactMoney(report.totals.costUsd) },
              { title: copy("Token", "Tokens"), value: compactTokens(report.totals.tokens) },
              { title: copy("Etkin gün", "Active days"), value: String(report.totals.activeDays) },
            ]}
          />
          <Card variant="surface">
            <Body muted>{copy("Günlük maliyet (USD)", "Daily cost (USD)")}</Body>
            <DailyBars
              label={copy("Günlük maliyet", "Daily cost")}
              data={report.daily.map((day) => ({ day: shortDay(day.date, locale), value: day.costUsd }))}
            />
            {peak ? <Body muted>{copy("En yüksek gün: {p0} · {p1}", "Peak day: {p0} · {p1}", { p0: shortDay(peak.date, locale), p1: compactMoney(peak.costUsd) })}</Body> : null}
          </Card>
          <Breakdown title={copy("Sağlayıcıya göre", "By provider")} rows={report.providers.map((row) => ({ key: row.provider, label: providerName(row.provider), ...row }))} />
          <Breakdown title={copy("Modele göre", "By model")} rows={report.models.map((row) => ({ key: `${row.provider}:${row.model}`, label: row.model, ...row }))} />
          <Breakdown title={copy("Projeye göre", "By project")} rows={report.projects.map((row) => ({ ...row, key: row.label, label: row.label || copy("Bilinmeyen klasör", "Unknown folder") }))} />
          {report.coverage.unpricedModels.length ? (
            <Body muted>{copy("Fiyatı bilinmeyen modeller yalnızca token olarak sayılır: {p0}", "Models without a price are counted in tokens only: {p0}", { p0: report.coverage.unpricedModels.join(", ") })}</Body>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** "2026-11-16" as a short local-calendar label ("Nov 16"); a malformed date stays as given. */
function shortDay(date: string, locale: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(year, month - 1, day).toLocaleDateString(locale, { month: "short", day: "numeric" });
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
