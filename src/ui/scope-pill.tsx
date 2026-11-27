import type { ReactNode } from "react";
import { Text } from "react-native";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import { LifecycleButton as PanelButton } from "./busy-indicator";
import { haptic } from "./motion";
import { useMobileTheme } from "./theme";
import { hitSlopFor, metrics, opacity, radii, SCOPE_PILL_MAX_WIDTH, space } from "./tokens";

/**
 * A compact scope selector in the page identity row, matching the computer pill: an at least 28
 * high pill that grows with system text size (48 hit area) with a leading role glyph, the current value and a chevron that opens a picker.
 * It never wraps: the value stays on one line and ends in an ellipsis within a bounded width, so a
 * long project name cannot push the page down; the full name stays in the spoken label and picker.
 */
export function ScopePill({ icon, label, status, accessibilityLabel, expanded = false, disabled = false, onPress }: {
  icon: ReactNode;
  label: string;
  /** Optional state text after the label (the computer's degraded link); it never shrinks. */
  status?: ReactNode;
  /** Spoken name: role, current value and what the tap does. */
  accessibilityLabel: string;
  expanded?: boolean;
  /** The scope cannot change right now (an operation or a call is busy); the value stays readable. */
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors, uiStyles, pressedFill } = useMobileTheme();
  return (
    <PanelButton
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded, disabled }}
      disabled={disabled}
      aria-expanded={expanded}
      variant="ghost"
      pressScale={1}
      className="rounded-full border-0 shadow-none active:opacity-75"
      hitSlop={hitSlopFor(metrics.chipHeight)}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs + 2,
        // A floor, not a fixed height: system text scaling grows the pill instead of clipping its name.
        minHeight: metrics.chipHeight,
        paddingStart: space.row,
        paddingEnd: space.sm,
        paddingVertical: space.xxs,
        borderRadius: radii.pill,
        backgroundColor: expanded ? pressedFill : colors.fill,
        opacity: disabled ? opacity.disabled : 1,
        flexShrink: 1,
        flexWrap: "nowrap",
        // Bounded; on a narrow row it shrinks further and the value ellipsizes.
        maxWidth: SCOPE_PILL_MAX_WIDTH,
        minWidth: 64,
      }}
    >
      {icon}
      <Text numberOfLines={1} ellipsizeMode="tail" style={[uiStyles.caption, { color: colors.text, flexShrink: 1, minWidth: 0 }]}>
        {label}
      </Text>
      {status}
      <ChevronDown size={12} strokeWidth={2.6} color={colors.muted} style={{ flexShrink: 0 }} />
    </PanelButton>
  );
}
