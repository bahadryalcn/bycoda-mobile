import { useMobileTheme } from "@/ui/theme";
import type { PropsWithChildren } from "react";
import { View } from "react-native";
import { Pressable } from "react-native";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import { Body } from "./typography";
import { colors, fontSize, metrics, opacity, radii, space } from "./tokens";
import { IconButton } from "./buttons";
import Animated from "react-native-reanimated";
import { BusyIndicator as Spinner } from "./busy-indicator";
import { usePressMotion } from "./motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Quiet chat chrome: a small label/icon inside a full, non-overlapping touch target. */
export function ChatToolbarAction({ label, accessibilityLabel, onPress, disabled, busy, tone = "muted", children }: PropsWithChildren<{
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: "muted" | "accent" | "danger";
}>) {
  useMobileTheme();
  const color = colors[tone];
  const off = !!(disabled || busy);
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ disabled: off, busy: !!busy }} disabled={off} onPress={onPress}
    aria-disabled={off} aria-busy={busy || undefined}
    style={({ pressed }) => ({ minHeight: metrics.touchTarget, minWidth: metrics.touchTarget,
      maxWidth: "100%", flexShrink: 1, paddingHorizontal: space.xs, gap: space.xs,
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      borderRadius: radii.control, opacity: off ? opacity.disabled : 1,
      backgroundColor: pressed ? colors.raised : "transparent" })}>
    {busy ? <Spinner size="sm" color={color} /> : children}
    <Body selectable={false} style={{ color, fontSize: fontSize.small, lineHeight: 18, fontWeight: "500", flexShrink: 1 }}>
      {label}
    </Body>
  </Pressable>;
}

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
 * Circular composer action: a 30dp visual (filled accent only when active) inside a
 * 48dp touch area, with a spring press and busy spinner.
 */
export function ChatCircleAction({
  label,
  onPress,
  disabled,
  busy,
  active,
  surface = false,
  children,
}: PropsWithChildren<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** Filled accent when the action can be performed; gray otherwise. */
  active?: boolean;
  surface?: boolean;
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
      style={[
        { width: metrics.touchTarget, height: metrics.touchTarget, alignItems: "center", justifyContent: "center" },
        press.animatedStyle,
      ]}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: radii.pill,
          backgroundColor: active ? colors.accentSolid : surface ? colors.panel : "transparent",
          borderWidth: surface ? 1 : 0,
          borderColor: colors.separator,
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
