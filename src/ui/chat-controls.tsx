import { useMobileTheme } from "@/ui/theme";
import { type PropsWithChildren } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import { Body } from "./typography";
import { fontSize, hitSlopFor, lineHeight, metrics, opacity, radii, space } from "./tokens";
import { IconButton } from "./buttons";
import { LifecycleButton as PanelButton } from "./busy-indicator";
import { useReducedMotionPreference } from "./use-reduced-motion";
import { messageSummary } from "./message-summary";

/** Quiet chat chrome: a small label/icon inside a full, non-overlapping touch target. */
export function ChatToolbarAction({
  label,
  accessibilityLabel,
  onPress,
  disabled,
  busy,
  tone = "muted",
  hideLabel = false,
  multiline = false,
  reserveTouchTarget = false,
  children,
}: PropsWithChildren<{
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: "muted" | "accent" | "danger";
  /** Bounded navigator accessories retain their spoken label and icon target. */
  hideLabel?: boolean;
  multiline?: boolean;
  reserveTouchTarget?: boolean;
}>) {
  const { colors } = useMobileTheme();
  const reducedMotion = useReducedMotionPreference();
  const color = colors[tone];
  const off = !!(disabled || busy);
  const fullTarget = multiline || reserveTouchTarget;
  return (
    <PanelButton
      variant="ghost"
      loading={busy}
      spinnerProps={{ size: "sm", color }}
      startContent={children}
      pressScale={reducedMotion ? 1 : 0.97}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: off, busy: !!busy }}
      disabled={off}
      onPress={onPress}
      aria-disabled={off}
      aria-busy={busy || undefined}
      hitSlop={fullTarget ? undefined : hitSlopFor(metrics.chipHeight)}
      style={{
        minHeight: fullTarget ? metrics.touchTarget : metrics.chipHeight,
        minWidth: fullTarget ? metrics.touchTarget : metrics.chipHeight,
        maxWidth: "100%",
        flexShrink: 1,
        paddingHorizontal: space.sm,
        gap: space.xs,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radii.pill,
        opacity: disabled && !busy ? opacity.disabled : 1,
        backgroundColor: "transparent",
      }}
    >
        {!hideLabel ? <Body
          selectable={false}
          numberOfLines={multiline ? 2 : 1}
          style={{
            color,
            fontSize: fontSize.small,
            lineHeight: 18,
            fontWeight: "500",
            flexShrink: 1,
          }}
        >
          {label}
        </Body> : null}
    </PanelButton>
  );
}

/** Compact visuals retain a 48dp tap area through hit slop. */
export function ChatAction({
  label,
  onPress,
  disabled,
  busy,
  primary,
  reserveTouchTarget,
  children,
}: PropsWithChildren<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  primary?: boolean;
  reserveTouchTarget?: boolean;
}>) {
  useMobileTheme();
  return (
    <IconButton
      label={label}
      disabled={disabled}
      busy={busy}
      tone={primary ? "primary" : "default"}
      reserveTouchTarget={reserveTouchTarget}
      onPress={onPress}
    >
      {children}
    </IconButton>
  );
}

/**
 * Circular composer action: a 32dp visual (filled when it can act; danger for Stop) with the
 * 48dp layout target, a spring press and a busy spinner.
 */
export function ChatCircleAction({
  label,
  onPress,
  disabled,
  busy,
  active,
  danger,
  surface = false,
  onLongPress,
  longPressLabel,
  hint,
  children,
}: PropsWithChildren<{
  label: string;
  onPress: () => void;
  /** Alternate action. Pair it with `longPressLabel` so assistive tech can reach it without a gesture. */
  onLongPress?: () => void;
  longPressLabel?: string;
  hint?: string;
  disabled?: boolean;
  busy?: boolean;
  /** Filled accent when the action can be performed; gray otherwise. */
  active?: boolean;
  /** Filled danger (Stop). */
  danger?: boolean;
  surface?: boolean;
}>) {
  const { colors } = useMobileTheme();
  const reducedMotion = useReducedMotionPreference();
  const off = !!(disabled || busy);
  const filled = danger ? colors.danger : active ? colors.accentSolid : undefined;
  const visualInset = (metrics.touchTarget - metrics.visualControl) / 2;
  return (
    <View>
      {filled || surface ? (
        <View
          accessible={false}
          importantForAccessibility="no"
          pointerEvents="none"
          style={{
            position: "absolute",
            top: visualInset,
            left: visualInset,
            width: metrics.visualControl,
            height: metrics.visualControl,
            borderRadius: radii.pill,
            backgroundColor: filled ?? colors.panel,
            borderWidth: filled ? 0 : StyleSheet.hairlineWidth,
            borderColor: colors.border,
            opacity: disabled && !busy ? opacity.disabled : 1,
          }}
        />
      ) : null}
      <PanelButton
        variant="ghost"
        size="icon"
        loading={busy}
        spinnerProps={{ size: "sm", color: filled ? colors.primaryText : colors.muted }}
        startContent={children}
        pressScale={reducedMotion ? 1 : 0.97}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityActions={onLongPress && longPressLabel ? [{ name: "longpress", label: longPressLabel }] : undefined}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "longpress") onLongPress?.();
        }}
        accessibilityState={{ disabled: off, busy: !!busy }}
        aria-disabled={off}
        aria-busy={busy || undefined}
        disabled={off}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        style={{
          width: metrics.touchTarget,
          height: metrics.touchTarget,
          minWidth: metrics.touchTarget,
          minHeight: metrics.touchTarget,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: radii.pill,
          backgroundColor: "transparent",
          opacity: disabled && !busy ? opacity.disabled : 1,
          padding: 0,
        }}
      />
    </View>
  );
}

/** One-line timeline summary; the full, plain-text description stays in its accessible name. */
export function ChatSummary({
  label,
  detail,
  status,
  color,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  detail?: string;
  status?: string;
  color?: string;
  icon: import("react").ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useMobileTheme();
  const summary = detail ? messageSummary(detail) : undefined;
  return (
    <PanelButton
      variant="ghost"
      pressScale={1}
      accessibilityRole="button"
      accessibilityLabel={[label, summary, status].filter(Boolean).join(". ")}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: metrics.touchTarget,
        paddingVertical: space.xs,
        paddingHorizontal: space.sm,
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        backgroundColor: "transparent",
        borderRadius: radii.control,
        opacity: disabled ? opacity.disabled : 1,
      }}
    >
      <View accessible={false} style={{ width: 20, alignItems: "center" }}>
        {icon}
      </View>
      <Body numberOfLines={1} style={{ flexShrink: 1, fontSize: fontSize.small, lineHeight: lineHeight.small, fontWeight: "500" }}>{label}</Body>
      {summary ? (
        <Body muted numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: fontSize.caption, lineHeight: lineHeight.caption }}>
          {summary}
        </Body>
      ) : <View style={{ flex: 1 }} />}
      {status ? (
        <Body numberOfLines={1} style={{ flexShrink: 1, fontSize: fontSize.caption, lineHeight: lineHeight.caption, color: color ?? colors.muted, maxWidth: "35%" }}>
          {status}
        </Body>
      ) : null}
      <ChevronRight size={15} color={colors.subtle} />
    </PanelButton>
  );
}
