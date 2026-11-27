import { useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { radii, space } from "./tokens";
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
 * The caller renders its caption; label supplies the meter's accessible name.
 */
export function RemainingMeter({ left, timeLeft, label }: { left: number; timeLeft: number | null; label: string }) {
  const { colors } = useMobileTheme();
  return (
    <View>
      <Meter value={left} accessibilityLabel={label} size="lg" color="success" thresholds={[...LEFT_THRESHOLDS]} />
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

/** A small meter for one account's share left; label names it without repeating the visible row. */
export function AccountMeter({ left, label }: { left: number; label: string }) {
  return <Meter value={left} accessibilityLabel={label} size="sm" color="success" thresholds={[...LEFT_THRESHOLDS]} />;
}

/** The tone the threshold scale gives a share left; the same steps as the PanelUI meters above. */
function leftTone(left: number): "danger" | "warning" | "success" {
  return left < 15 ? "danger" : left < 40 ? "warning" : "success";
}

const LABEL_INSET = 8;
const NAMED_BAR_HEIGHT = 22;
/** Vertical room kept around the name when large text makes the bar taller than its floor. */
const LABEL_PAD = 2;

/**
 * A share-left bar that carries whose it is: the name (and an optional leading glyph) sits inside
 * the fill on the solid-status ink, or just after the fill on the track when the fill is too short.
 * `timeLeft` draws the even-pace marker like `RemainingMeter`. One accessible node speaks `label`.
 */
export function NamedMeter({ left, timeLeft = null, name, glyph, label }: {
  left: number;
  timeLeft?: number | null;
  name: string;
  /** Renders the leading glyph in the colour the label currently uses. */
  glyph?: (color: string) => ReactNode;
  label: string;
}) {
  const { colors, semanticColors, uiStyles } = useMobileTheme();
  const [track, setTrack] = useState(0);
  const [text, setText] = useState({ width: 0, height: 0 });
  const share = Math.min(100, Math.max(0, left));
  const tone = semanticColors[leftTone(share)];
  const fill = (track * share) / 100;
  const rest = track - fill;
  // Inside when it fits; otherwise whichever side has more room, truncating there.
  const need = text.width + LABEL_INSET * 2;
  const inside = need <= fill || (need > rest && fill >= rest);
  // A floor, not a fixed height: the measured name line (which grows with system text size) sets it.
  const height = Math.max(NAMED_BAR_HEIGHT, Math.ceil(text.height) + LABEL_PAD * 2);
  const ink = inside ? colors.statusOnSolid : colors.text;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(share) }}
      onLayout={(event) => setTrack(event.nativeEvent.layout.width)}
      style={{ height, borderRadius: radii.pill, backgroundColor: tone.surface, justifyContent: "center" }}
    >
      <View style={{ position: "absolute", start: 0, top: 0, bottom: 0, width: `${share}%`, borderRadius: radii.pill, backgroundColor: tone.text }} />
      {/* Unconstrained copy for the natural width, so truncation never flips the placement. */}
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        pointerEvents="none"
        onLayout={(event) => {
          const { width, height: measured } = event.nativeEvent.layout;
          setText((current) => current.width === width && current.height === measured ? current : { width, height: measured });
        }}
        style={{ position: "absolute", start: 0, flexDirection: "row", alignItems: "center", gap: space.xs, opacity: 0 }}
      >
        {glyph?.(ink)}
        <Text numberOfLines={1} style={[uiStyles.caption, { fontWeight: "600" }]}>{name}</Text>
      </View>
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        pointerEvents="none"
        style={{
          position: "absolute",
          start: inside ? LABEL_INSET : fill + LABEL_INSET,
          maxWidth: Math.max(0, (inside ? fill : rest) - LABEL_INSET * 2),
          flexDirection: "row",
          alignItems: "center",
          gap: space.xs,
          opacity: track ? 1 : 0,
        }}
      >
        {glyph?.(ink)}
        <Text numberOfLines={1} style={[uiStyles.caption, { color: ink, fontWeight: "600", flexShrink: 1 }]}>{name}</Text>
      </View>
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
