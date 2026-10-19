import { useMobileTheme } from "@/ui/theme";
import type { PropsWithChildren } from "react";
import { View } from "react-native";
import { Pressable } from "react-native";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import { Body } from "./typography";
import { colors, fontSize, metrics, radii, space } from "./tokens";
import { IconButton } from "./buttons";
import Animated from "react-native-reanimated";
import { Spinner } from "panelui-native/components/spinner";
import { usePressMotion } from "./motion";

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
  useMobileTheme();
  return (
    <IconButton
      label={label}
      disabled={disabled}
      busy={busy}
      tone={primary ? "primary" : "default"}
      density="compact"
      onPress={onPress}
    >
      {children}
    </IconButton>
  );
}

/**
 * Circular composer action: a 34pt disc (filled accent when active, gray otherwise) inside a
 * 44pt touch area, with a spring press and busy spinner.
 */
export function ChatCircleAction({
  label,
  onPress,
  disabled,
  busy,
  active,
  children,
}: PropsWithChildren<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** Filled accent when the action can be performed; gray otherwise. */
  active?: boolean;
}>) {
  useMobileTheme();
  const press = usePressMotion(0.88);
  const off = !!(disabled || busy);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: !!busy }}
      aria-disabled={off}
      aria-busy={busy || undefined}
      disabled={off}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      hitSlop={6}
      style={[
        { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
        press.animatedStyle,
      ]}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: radii.pill,
          backgroundColor: active ? colors.accentSolid : colors.fill,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled && !busy ? 0.6 : 1,
        }}
      >
        {busy ? <Spinner size="sm" color={active ? colors.primaryText : colors.muted} /> : children}
      </View>
    </AnimatedPressable>
  );
}

/** A quiet, borderless row for one-line activity, tools and code (icon, summary, chevron). */
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
  useMobileTheme();
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
        backgroundColor: pressed ? colors.raised : "transparent",
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
