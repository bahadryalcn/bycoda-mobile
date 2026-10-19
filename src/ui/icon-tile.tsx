import { useMobileTheme } from "./theme";
import { View } from "react-native";
import type { ReactNode } from "react";
import { colors } from "./tokens";

/** Settings-style rounded square; a 6-digit tint becomes a soft fill behind the glyph. */
export function IconTile({
  children,
  color,
  size = 32,
}: {
  children: ReactNode;
  color?: string;
  size?: number;
}) {
  useMobileTheme();
  const tinted = !!color && /^#[\da-f]{6}$/i.test(color);
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
        backgroundColor: tinted ? `${color}24` : colors.fill,
      }}
    >
      {children}
    </View>
  );
}
