import { useMobileTheme } from "./theme";
import { View } from "react-native";
import type { ReactNode } from "react";
import { colors } from "./tokens";

/** A neutral icon well; semantic meaning belongs to its glyph and label. */
export function IconTile({
  children,
  color: _color,
  size = 32,
}: {
  children: ReactNode;
  color?: string;
  size?: number;
}) {
  useMobileTheme();
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        justifyContent: "center",
        alignItems: "center",
        borderRadius: Math.round(size * 0.28),
        borderCurve: "continuous",
        backgroundColor: colors.fill,
      }}
    >
      {children}
    </View>
  );
}
