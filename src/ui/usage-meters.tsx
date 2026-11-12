import { View } from "react-native";
import { BarChart } from "panelui-native/components/bar-chart";
import { Kpi } from "panelui-native/components/kpi";
import { Meter } from "panelui-native/components/meter";
import { useMobileTheme } from "./theme";

/** PanelUI meters and charts for the Usage screen, kept behind one facade like the other PanelUI imports. */

/** Colour falls from success to destructive as the share left runs out. */
const LEFT_THRESHOLDS = [
  { from: 0, color: "destructive" },
  { from: 15, color: "warning" },
  { from: 40, color: "success" },
] as const;

/**
 * Share of a quota window left, with a marker where an even spender would be:
 * the share of the window's time still ahead. A bar left of the marker is ahead of pace.
 */
export function RemainingMeter({ left, timeLeft, label }: { left: number; timeLeft: number | null; label: string }) {
  const { colors } = useMobileTheme();
  return (
    <View>
      <Meter value={left} label={label} size="lg" color="success" thresholds={[...LEFT_THRESHOLDS]} />
      {timeLeft !== null ? (
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={{ position: "absolute", top: -3, bottom: -3, left: `${Math.min(99.5, Math.max(0, timeLeft))}%`, width: 2, marginLeft: -1, borderRadius: 1, backgroundColor: colors.text }}
        />
      ) : null}
    </View>
  );
}

/** A small meter for one account's share left. */
export function AccountMeter({ left, label }: { left: number; label: string }) {
  return <Meter value={left} label={label} size="sm" color="success" thresholds={[...LEFT_THRESHOLDS]} />;
}

/** One headline figure with an optional footnote line; cost rising is the bad direction. */
export function CostKpi({ title, value, children }: { title: string; value: string; children?: React.ReactNode }) {
  return (
    <Kpi goodDirection="down">
      <Kpi.Header>
        <Kpi.Title>{title}</Kpi.Title>
      </Kpi.Header>
      <Kpi.Content>
        <Kpi.Stat>
          <Kpi.Value>{value}</Kpi.Value>
          {children}
        </Kpi.Stat>
      </Kpi.Content>
    </Kpi>
  );
}

/** Daily totals as bars from a zero baseline; `label` also names the chart for screen readers. */
export function DailyBars({ data, label }: { data: { day: string; value: number }[]; label: string }) {
  return (
    <BarChart data={data} xDataKey="day" aspectRatio={2} accessibilityLabel={label}>
      <BarChart.Grid />
      <BarChart.Bar dataKey="value" />
      <BarChart.XAxis ticks={4} />
    </BarChart>
  );
}
