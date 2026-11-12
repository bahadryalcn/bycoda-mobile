import type { ComponentProps, Ref } from "react";
import { Pressable, View, type HostInstance } from "react-native";
import { Spinner } from "panelui-native/components/spinner";
import { Button as PanelButton } from "panelui-native/components/button";
import { radii } from "./tokens";
import { useFeedbackAnimation } from "./use-feedback-animation";
import { useMobileTheme } from "./theme";

type SpinnerProps = ComponentProps<typeof Spinner>;
type BusyIndicatorProps = Pick<SpinnerProps, "size" | "color" | "trackColor" | "label">;

/** Keep the busy glyph's footprint without mounting an unconditional upstream loop. */
function StaticBusyIndicator({ size = "md", color, trackColor, label }: BusyIndicatorProps) {
  const { colors } = useMobileTheme();
  const dimension = size === "lg" ? 32 : size === "md" ? 24 : 16;
  return <View accessible={!!label} accessibilityRole={label ? "progressbar" : undefined}
    accessibilityLabel={label} accessibilityState={{ busy: !!label }}
    accessibilityElementsHidden={!label} importantForAccessibility={label ? "auto" : "no-hide-descendants"}
    style={{ width: dimension, height: dimension, borderRadius: radii.pill,
      borderWidth: size === "lg" ? 3 : 2, borderColor: trackColor ?? colors.border,
      borderTopColor: color ?? colors.accent }} />;
}

export function BusyIndicator(props: BusyIndicatorProps) {
  const animate = useFeedbackAnimation();
  return animate ? <Spinner {...props} /> : <StaticBusyIndicator {...props} />;
}

/**
 * PanelUI overwrites native busy with loading and has no custom loading slot. `quietBusy` keeps
 * the busy/disabled semantics without drawing a glyph, for the second busy control of one
 * operation (see `useSoleSpinner`).
 */
export function LifecycleButton({ quietBusy, ...props }: ComponentProps<typeof PanelButton> & { quietBusy?: boolean }) {
  return props.loading || quietBusy ? <BusyLifecycleButton {...props} indicator={!!props.loading} /> : <PanelButton {...props} />;
}

function BusyLifecycleButton({ indicator, ...props }: ComponentProps<typeof PanelButton> & { indicator: boolean }) {
  const animate = useFeedbackAnimation();
  if (animate && indicator) return <PanelButton {...props} />;
  return <Pressable ref={props.ref as unknown as Ref<HostInstance>} onLayout={props.onLayout}
    accessibilityRole="button" accessibilityLabel={props.accessibilityLabel}
    accessibilityHint={props.accessibilityHint}
    accessibilityState={{ ...props.accessibilityState, disabled: true, busy: true }}
    aria-disabled aria-busy aria-pressed={props.accessibilityState?.selected} aria-expanded={props.accessibilityState?.expanded}
    disabled className={`flex-row items-center justify-center gap-2 ${props.className ?? ""}`}
    style={props.style}>
    {indicator ? <StaticBusyIndicator size="sm" {...props.spinnerProps} /> : null}
    {indicator ? null : props.startContent}
    {props.children}
    {props.endContent}
  </Pressable>;
}
