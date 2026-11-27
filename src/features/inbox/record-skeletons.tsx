import { View } from "react-native";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { radii, space } from "@/ui/tokens";
import { useDelayedVisible } from "@/ui/use-delayed-visible";

const NAME_WIDTHS = ["62%", "48%", "56%"] as const;

/**
 * Placeholder shaped like a checks list (name, then a status dot and short state), so the section
 * keeps its size and nothing jumps when the rows arrive. Static: the read is bounded by a deadline.
 */
export function CheckRowsSkeleton({ rows = 3 }: { rows?: number }) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  // Like every placeholder: shown after 250 ms, so a cached or fast read never flashes it.
  const visible = useDelayedVisible();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={copy("Kontroller yükleniyor", "Loading checks")} accessibilityState={{ busy: true }}>
      <View importantForAccessibility="no-hide-descendants" style={{ gap: space.md, paddingVertical: space.xs, opacity: visible ? 1 : 0 }}>
        {Array.from({ length: rows }, (_, index) => (
          <View key={index} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <View style={{ flex: 1 }}>
              <View style={{ height: 12, width: NAME_WIDTHS[index % NAME_WIDTHS.length], borderRadius: radii.badge, backgroundColor: colors.raised }} />
            </View>
            <View style={{ width: 6, height: 6, borderRadius: radii.pill, backgroundColor: colors.raised }} />
            <View style={{ height: 10, width: 48, borderRadius: radii.badge, backgroundColor: colors.panel }} />
          </View>
        ))}
      </View>
    </View>
  );
}
