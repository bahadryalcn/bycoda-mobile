import { useCallback, useState, type PropsWithChildren } from "react";
import { Text, View, useWindowDimensions, type ColorValue, type LayoutChangeEvent } from "react-native";
import { Body } from "@/ui/typography";
import { useMobileTheme } from "@/ui/theme";
import { colors, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { sessionStatusInline } from "./session-header-model";

/** Status and scope share one identity column beside the frequent controls. */
export function SessionHeader({ status, context, statusColor, compact, children }: PropsWithChildren<{
  status: string; context?: string; statusColor: ColorValue; compact: boolean;
}>) {
  useMobileTheme();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const [actions, setActions] = useState(0);
  const measureWidth = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (Number.isFinite(next) && next > 0) setWidth(previous => previous === next ? previous : next);
  }, []);
  const measureActions = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (Number.isFinite(next) && next > 0) setActions(previous => previous === next ? previous : next);
  }, []);
  const inline = sessionStatusInline(width, actions, fontScale);
  const identity = <View style={{ minWidth: 0, gap: space.xxs }}><Body accessibilityLabel={status} style={uiStyles.caption}>
    <Text accessible={false} aria-hidden style={{ color: statusColor }}>●{" "}</Text>
    <Body style={[uiStyles.caption, { color: colors.text, fontWeight: "600" }]}>{status}</Body>
  </Body>
    {context ? <Body muted style={uiStyles.caption}>{context}</Body> : null}
  </View>;
  return <View onLayout={measureWidth} style={{ minWidth: 0, gap: compact ? space.xxs : space.xs }}>
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "nowrap", gap: space.sm }}>
      {inline ? <View style={{ flex: 1, minWidth: 0 }}>{identity}</View> : null}
      <View onLayout={measureActions} style={{ flexDirection: "row", alignItems: "flex-start", flexWrap: "nowrap",
        flexShrink: 1, maxWidth: "100%", marginStart: "auto", gap: space.xs }}>{children}</View>
    </View>
    {!inline ? identity : null}
  </View>;
}
