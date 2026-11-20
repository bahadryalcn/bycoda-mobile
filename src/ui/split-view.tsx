import type { ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { splitListWidth, useAdaptiveLayout } from "./adaptive-layout";
import { useMobileTheme } from "./theme";

/**
 * Wide-tablet frame: an optional navigation rail, a proportional list column (32% of the window, 320-420dp) and the detail pane.
 * Each pane owns its own scrolling; the frame only divides the width with hairlines.
 * On a vertical hinge the list side ends exactly at the hinge and the detail starts after it,
 * so nothing is drawn under the fold.
 *
 * The tree is the same for every arrangement: `rail` and `list` may be omitted (phone, portrait tablet) and the
 * hinge gap may appear or disappear, but `detail` always sits in the last slot of the same root. A detail that
 * must survive rotation, window resizing or unfolding (the open session with its transcript, scroll and
 * composer draft) therefore keeps its identity instead of remounting when the arrangement changes.
 */
export function SplitView({ rail, list, detail }: { rail?: ReactNode; list?: ReactNode; detail: ReactNode }) {
  const { colors } = useMobileTheme();
  const { hinge } = useAdaptiveLayout();
  const { width } = useWindowDimensions();
  const vertical = hinge?.axis === "vertical" ? hinge : undefined;
  const listFrame = vertical
    ? { flex: 1, minWidth: 0 }
    : { width: splitListWidth(width), borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.separator };
  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.background }}>
      {/* Slot 1: rail + list. It is empty (zero width) when neither is shown. */}
      <View style={[{ flexDirection: "row", flexShrink: 0 }, vertical ? { width: vertical.start } : null]}>
        {rail ?? null}
        {/* The list draws the screen background itself; a panel fill here would only show as a band
            above it where the column clears the status bar. */}
        {list ? <View style={listFrame}>{list}</View> : null}
      </View>
      {/* Slot 2: the hinge gap, present only on a vertical fold. */}
      {vertical ? <View style={{ width: vertical.size, backgroundColor: colors.background }} /> : null}
      {/* Slot 3: the detail. */}
      <View style={{ flex: 1, minWidth: 0 }}>{detail}</View>
    </View>
  );
}
