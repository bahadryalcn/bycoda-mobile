import { View } from "react-native";
import { useState } from "react";
import { Skeleton } from "panelui-native/components/skeleton";
import { useMobileTheme } from "@/ui/theme";
import { useCopy } from "@/ui/copy";
import { radii, space } from "@/ui/tokens";
import { useDelayedVisible } from "@/ui/use-delayed-visible";

const rows = [
  { mine: false, widths: ["72%", "58%"] },
  { mine: true, widths: ["46%"] },
  { mine: false, widths: ["80%", "64%", "38%"] },
] as const;

/** Message-shaped placeholder shown while the first transcript snapshot loads. */
export function TranscriptSkeleton({ label }: { label?: string }) {
  const [height, setHeight] = useState(0);
  const { colors } = useMobileTheme();
  const copy = useCopy();
  // Like the shared Skeleton: a fast or cached transcript never flashes placeholders.
  const visible = useDelayedVisible();
  // Match the measured chat viewport, including keyboard and native header clearance.
  const placeholders: (typeof rows)[number][] = [];
  let used = space.md * 2;
  while (height > 0) {
    const row = rows[placeholders.length % rows.length];
    const next = row.widths.length * 12 + (row.widths.length - 1) * space.xs
      + (row.mine ? space.md * 2 : 0) + (placeholders.length ? space.lg : 0);
    if (used + next > height) break;
    placeholders.push(row);
    used += next;
  }
  const displayedRows = height > 0 ? placeholders : rows;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? copy("Oturum yükleniyor…", "Loading session…")}
      accessibilityState={{ busy: true }}
      aria-busy
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      style={{ flex: 1, gap: space.lg, paddingVertical: space.md }}
    >
      {visible ? displayedRows.map((row, index) => (
        <View
          key={index}
          importantForAccessibility="no-hide-descendants"
          style={{
            alignSelf: row.mine ? "flex-end" : "flex-start",
            width: row.mine ? "62%" : "88%",
            gap: space.xs,
            padding: row.mine ? space.md : 0,
            borderRadius: radii.bubble,
            backgroundColor: row.mine ? colors.raised : "transparent",
          }}
        >
          {row.widths.map((width, line) => (
            <Skeleton
              key={line}
              style={{ height: 12, width, borderRadius: radii.badge, backgroundColor: row.mine ? colors.panel : colors.raised }}
            />
          ))}
        </View>
      )) : null}
    </View>
  );
}
