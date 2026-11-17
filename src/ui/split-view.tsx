import type { ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { splitListWidth, useAdaptiveLayout } from "./adaptive-layout";
import { useMobileTheme } from "./theme";

/**
 * Wide-tablet frame: an optional navigation rail, a proportional list column (32% of the window, 320-420dp) and the detail pane.
 * Each pane owns its own scrolling; the frame only divides the width with hairlines.
 * On a vertical hinge the list side ends exactly at the hinge and the detail starts after it,
 * so nothing is drawn under the fold.
 */
export function SplitView({ rail, list, detail }: { rail?: ReactNode; list: ReactNode; detail: ReactNode }) {
  const { colors } = useMobileTheme();
  const { hinge } = useAdaptiveLayout();
  const { width } = useWindowDimensions();
  const divider = { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.separator };
  if (hinge?.axis === "vertical") {
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.background }}>
        <View style={{ width: hinge.start, flexDirection: "row" }}>
          {rail}
          <View style={{ flex: 1, minWidth: 0 }}>{list}</View>
        </View>
        <View style={{ width: hinge.size, backgroundColor: colors.background }} />
        <View style={{ flex: 1, minWidth: 0 }}>{detail}</View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.background }}>
      {rail}
      {/* The list draws the screen background itself; a panel fill here would only show as a band
          above it where the column clears the status bar. */}
      <View style={[{ width: splitListWidth(width) }, divider]}>{list}</View>
      <View style={{ flex: 1, minWidth: 0 }}>{detail}</View>
    </View>
  );
}
