import type { ComponentProps } from "react";
import { Pressable, View } from "react-native";
import { Spinner } from "panelui-native/components/spinner";
import { Button as PanelButton } from "panelui-native/components/button";
import { colors, radii } from "./tokens";
import { useFeedbackAnimation } from "./use-feedback-animation";

type SpinnerProps = ComponentProps<typeof Spinner>;
type BusyIndicatorProps = Pick<SpinnerProps, "size" | "color" | "trackColor" | "label">;

/** Keep the busy glyph's footprint without mounting an unconditional upstream loop. */
function StaticBusyIndicator({ size = "md", color, trackColor, label }: BusyIndicatorProps) {
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

/** PanelUI overwrites native busy with loading and has no custom loading slot. */
export function LifecycleButton(props: ComponentProps<typeof PanelButton>) {
  return props.loading ? <BusyLifecycleButton {...props} /> : <PanelButton {...props} />;
}

function BusyLifecycleButton(props: ComponentProps<typeof PanelButton>) {
  const animate = useFeedbackAnimation();
  if (animate) return <PanelButton {...props} />;
  return <Pressable ref={props.ref} onLayout={props.onLayout}
    accessibilityRole="button" accessibilityLabel={props.accessibilityLabel}
    accessibilityHint={props.accessibilityHint}
    accessibilityState={{ ...props.accessibilityState, disabled: true, busy: true }}
    aria-disabled aria-busy aria-pressed={props.accessibilityState?.selected} aria-expanded={props.accessibilityState?.expanded}
    disabled className={`flex-row items-center justify-center gap-2 ${props.className ?? ""}`}
    style={props.style}>
    <StaticBusyIndicator size="sm" {...props.spinnerProps} />
    {props.children}
    {props.endContent}
  </Pressable>;
}
