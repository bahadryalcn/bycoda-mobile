import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { SPLIT_LIST_WIDTH } from "./adaptive-layout";
import { useMobileTheme } from "./theme";

/**
 * Wide-tablet frame: an optional navigation rail, a fixed list column and the detail pane.
 * Each pane owns its own scrolling; the frame only divides the width with hairlines.
 */
export function SplitView({ rail, list, detail }: { rail?: ReactNode; list: ReactNode; detail: ReactNode }) {
  const { colors } = useMobileTheme();
  const divider = { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.separator };
  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.background }}>
      {rail}
      {/* The list draws the screen background itself; a panel fill here would only show as a band
          above it where the column clears the status bar. */}
      <View style={[{ width: SPLIT_LIST_WIDTH }, divider]}>{list}</View>
      <View style={{ flex: 1, minWidth: 0 }}>{detail}</View>
    </View>
  );
}
