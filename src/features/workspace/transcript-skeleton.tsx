import { View } from "react-native";
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
  const { colors } = useMobileTheme();
  const copy = useCopy();
  // Like the shared Skeleton: a fast or cached transcript never flashes placeholders.
  const visible = useDelayedVisible();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? copy("Oturum yükleniyor…", "Loading session…")}
      accessibilityState={{ busy: true }}
      aria-busy
      style={{ flex: 1, gap: space.lg, paddingVertical: space.md }}
    >
      {visible ? rows.map((row, index) => (
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
            <View
              key={line}
              style={{ height: 12, width, borderRadius: radii.badge, backgroundColor: row.mine ? colors.panel : colors.raised }}
            />
          ))}
        </View>
      )) : null}
    </View>
  );
}
