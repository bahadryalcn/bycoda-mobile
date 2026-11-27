import type { ComponentProps } from "react";
import { View } from "react-native";
import { Spinner } from "panelui-native/components/spinner";
import { radii } from "./tokens";
import { useFeedbackAnimation } from "./use-feedback-animation";
import { useMobileTheme } from "./theme";

type SpinnerProps = ComponentProps<typeof Spinner>;
export type BusyIndicatorProps = Pick<SpinnerProps, "size" | "color" | "trackColor" | "label">;

/** Keep the busy glyph's footprint without mounting an unconditional upstream loop. */
export function StaticBusyIndicator({ size = "md", color, trackColor, label }: BusyIndicatorProps) {
  const { colors } = useMobileTheme();
  const dimension = size === "lg" ? 32 : size === "md" ? 24 : 16;
  return <View accessible={!!label} accessibilityRole={label ? "progressbar" : undefined}
    accessibilityLabel={label} accessibilityState={{ busy: !!label }}
    accessibilityElementsHidden={!label} importantForAccessibility={label ? "auto" : "no-hide-descendants"}
    style={{ width: dimension, height: dimension, borderRadius: radii.pill,
      borderWidth: size === "lg" ? 3 : 2, borderColor: trackColor ?? colors.border,
      borderTopColor: color ?? colors.accent }} />;
}

/**
 * The one busy glyph: PanelUI Spinner while feedback animation is allowed, otherwise a static ring of
 * the same footprint (reduced motion, backgrounded app). Status lines, Loading and rows all use it.
 */
export function BusyIndicator(props: BusyIndicatorProps) {
  const animate = useFeedbackAnimation();
  return animate ? <Spinner {...props} /> : <StaticBusyIndicator {...props} />;
}
