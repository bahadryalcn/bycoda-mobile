import { View } from "react-native";
import type { ReactNode } from "react";
import { colors, radii } from "./tokens";

export function IconTile({
  children,
  color = colors.border,
}: {
  children: ReactNode;
  color?: string;
}) {
  return (
    <View
      accessible={false}
      style={{
        width: 34,
        height: 34,
        flexShrink: 0,
        justifyContent: "center",
        alignItems: "center",
        borderRadius: radii.control,
        backgroundColor: colors.raised,
        borderWidth: 0,
        borderColor: color,
      }}
    >
      {children}
    </View>
  );
}
