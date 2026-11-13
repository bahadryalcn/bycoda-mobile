import { View } from "react-native";
import { BarChart } from "panelui-native/components/bar-chart";
import { Kpi } from "panelui-native/components/kpi";
import { PieChart } from "panelui-native/components/pie-chart";
import { Body } from "@/ui/primitives";
import { MetricRow } from "@/ui/metric-row";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { radii, space } from "@/ui/tokens";
import { compactTokens, type ProviderUsage } from "./usage-breakdown";

/** Usage headline: one PanelUI KPI per figure, wrapping to a second row on a narrow phone. */
const KPI_MIN_WIDTH = 100;
/** A donut is drawn for two to this many providers; more than that becomes bars. */
const MAX_DONUT_PROVIDERS = 6;
const PIE_SIZE = 168;
const SWATCH = 10;

export function UsageKpis({ items }: { items: { title: string; value: string }[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      {items.map((item) => (
        <View key={item.title} style={{ flexGrow: 1, flexBasis: KPI_MIN_WIDTH, minWidth: 0 }}>
          <Kpi>
            <Kpi.Header>
              <Kpi.Title>{item.title}</Kpi.Title>
            </Kpi.Header>
            <Kpi.Content>
              <Kpi.Stat>
                <Kpi.Value>{item.value}</Kpi.Value>
              </Kpi.Stat>
            </Kpi.Content>
          </Kpi>
        </View>
      ))}
    </View>
  );
}

/**
 * Token share per provider on this page. One provider needs no chart (a full bar says nothing);
 * two to six are a donut with a legend; more are bars. Unreported providers stay in the legend as "—".
 */
export function ProviderShare({ rows }: { rows: ProviderUsage[] }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const palette = [
    colors.accent,
    colors.success,
    colors.warning,
    colors.danger,
    colors.info,
    colors.tertiary,
  ];
  const reported = rows.filter((row) => row.tokens !== null);
  const total = reported.reduce((sum, row) => sum + (row.tokens ?? 0), 0);
  const colorOf = (provider: string) =>
    palette[reported.findIndex((row) => row.provider === provider) % palette.length];
  const fractionOf = (row: ProviderUsage) =>
    row.tokens !== null && total > 0 ? row.tokens / total : null;
  if (!rows.length) return null;
  const label = copy("Sağlayıcıya göre token payı", "Token share by provider");
  return (
    <View style={{ gap: space.md }}>
      {total > 0 && reported.length > 1 && reported.length <= MAX_DONUT_PROVIDERS ? (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={label}
          style={{ alignItems: "center" }}
        >
          <PieChart
            data={reported.map((row) => ({
              label: row.provider,
              value: row.tokens ?? 0,
              color: colorOf(row.provider),
            }))}
            size={PIE_SIZE}
            innerRadius={0.6}
          >
            <PieChart.Center
              defaultLabel={copy("Toplam", "Total")}
              formatValue={(value) => compactTokens(value)}
            />
          </PieChart>
        </View>
      ) : null}
      {reported.length > MAX_DONUT_PROVIDERS ? (
        <BarChart
          data={reported.map((row) => ({ provider: row.provider, tokens: row.tokens ?? 0 }))}
          xDataKey="provider"
          aspectRatio={2}
          accessibilityLabel={label}
        >
          <BarChart.Grid />
          <BarChart.Bar dataKey="tokens" />
          <BarChart.XAxis ticks={MAX_DONUT_PROVIDERS} />
        </BarChart>
      ) : null}
      {!reported.length ? (
        <Body muted>{copy("Sağlayıcı token bildirmedi.", "No token readings were reported.")}</Body>
      ) : null}
      <View style={{ gap: space.xs }}>
        {rows.map((row) => {
          const fraction = fractionOf(row);
          return (
            <View
              key={row.provider}
              style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
            >
              <View
                accessible={false}
                style={{
                  width: SWATCH,
                  height: SWATCH,
                  borderRadius: radii.pill,
                  backgroundColor: fraction === null ? colors.tertiary : colorOf(row.provider),
                }}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <MetricRow
                  label={row.provider}
                  value={
                    row.tokens === null
                      ? "—"
                      : fraction === null
                        ? compactTokens(row.tokens)
                        : `${compactTokens(row.tokens)} · ${Math.round(fraction * 100)}%`
                  }
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
