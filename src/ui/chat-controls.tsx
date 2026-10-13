import type { PropsWithChildren } from "react";
import { ActivityIndicator, View } from "react-native";
import { Pressable } from "./gluestack/pressable";
import Animated from "react-native-reanimated";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import { Body } from "./typography";
import { usePressMotion } from "./motion";
import { colors, fontSize, metrics, opacity, radii, space } from "./tokens";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Compact visuals retain a 48dp tap area through hit slop. */
export function ChatAction({
  label,
  onPress,
  disabled,
  busy,
  primary,
  children,
}: PropsWithChildren<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  primary?: boolean;
}>) {
  const press = usePressMotion();
  const off = !!(disabled || busy);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: !!busy }}
      disabled={off}
      hitSlop={(metrics.touchTarget - 36) / 2}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        {
          width: 36,
          height: 36,
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 18,
          backgroundColor: primary ? colors.accentSolid : "transparent",
          opacity: off ? opacity.disabled : 1,
        },
        press.animatedStyle,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={primary ? colors.primaryText : colors.accent} />
      ) : (
        children
      )}
    </AnimatedPressable>
  );
}

/** One readable entry point, with the result visible before opening its details. */
export function ChatSummary({
  label,
  detail,
  status,
  color = colors.muted,
  icon,
  onPress,
}: {
  label: string;
  detail?: string;
  status?: string;
  color?: string;
  icon: import("react").ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[label, detail, status].filter(Boolean).join(". ")}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: metrics.touchTarget,
        paddingVertical: space.xs,
        paddingHorizontal: space.sm,
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        backgroundColor: pressed ? colors.raised : colors.panel,
        borderRadius: radii.control,
      })}
    >
      <View accessible={false} style={{ width: 20, alignItems: "center" }}>
        {icon}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Body
          numberOfLines={1}
          style={{ fontSize: fontSize.small, lineHeight: 18, fontWeight: "500" }}
        >
          {label}
        </Body>
        {detail ? (
          <Body muted numberOfLines={1} style={{ fontSize: fontSize.caption, lineHeight: 16 }}>
            {detail}
          </Body>
        ) : null}
      </View>
      {status ? (
        <Body
          numberOfLines={1}
          style={{ fontSize: fontSize.caption, lineHeight: 16, color, maxWidth: "35%" }}
        >
          {status}
        </Body>
      ) : null}
      <ChevronRight size={15} color={colors.subtle} />
    </Pressable>
  );
}
