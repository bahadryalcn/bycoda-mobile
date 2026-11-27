import type { ComponentProps, Ref } from "react";
import { Pressable, type HostInstance } from "react-native";
import { Button as PanelButton } from "panelui-native/components/button";
import { useFeedbackAnimation } from "./use-feedback-animation";
import { BusyIndicator, StaticBusyIndicator } from "./busy-glyph";

export { BusyIndicator };

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
