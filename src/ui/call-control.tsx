import type { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";
import { Body } from "./typography";
import { LifecycleButton as PanelButton } from "./busy-indicator";
import { useMobileTheme } from "./theme";
import { opacity, radii, space } from "./tokens";
import { useReducedMotionPreference } from "./use-reduced-motion";
import { haptic } from "./motion";

export const CALL_CONTROL_SIZE = 64;

/**
 * A call screen control: a large round icon button with its visible label underneath, like a phone
 * call's dock. `selected` always means "off or muted" (microphone or speaker off, drawn with a slashed
 * icon); `danger` is End. The visible label states what a tap does ("Mute" / "Unmute"), and a light
 * haptic confirms the tap for an owner who is not looking at the phone.
 */
export function CallControl({ label, accessibilityLabel, selected, danger, disabled, onPress, children }: PropsWithChildren<{
  label: string;
  accessibilityLabel?: string;
  selected?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onPress(): void;
}>) {
  const { colors, uiStyles } = useMobileTheme(), reduced = useReducedMotionPreference();
  const fill = danger ? colors.danger : selected ? colors.text : colors.glass;
  return <View style={{ alignItems: "center", gap: space.xs, minWidth: CALL_CONTROL_SIZE, opacity: disabled ? opacity.disabled : 1 }}>
    <PanelButton
      variant="ghost"
      size="icon"
      startContent={children}
      pressScale={reduced ? 1 : 0.94}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      aria-disabled={!!disabled}
      disabled={disabled}
      onPress={() => { haptic.tap(); onPress(); }}
      style={{
        width: CALL_CONTROL_SIZE, height: CALL_CONTROL_SIZE, minWidth: CALL_CONTROL_SIZE, minHeight: CALL_CONTROL_SIZE,
        borderRadius: radii.pill, padding: 0, alignItems: "center", justifyContent: "center",
        backgroundColor: fill, borderWidth: danger || selected ? 0 : StyleSheet.hairlineWidth, borderColor: colors.border,
      }}
    />
    <Body style={[uiStyles.caption, { color: colors.text, textAlign: "center", maxWidth: CALL_CONTROL_SIZE + space.xl }]} importantForAccessibility="no" accessibilityElementsHidden>{label}</Body>
  </View>;
}
