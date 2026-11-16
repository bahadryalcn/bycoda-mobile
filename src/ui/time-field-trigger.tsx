import { AnimatedPressable } from "panelui-native/primitives/animated-pressable";
import { InputGroup } from "panelui-native/components/input-group";
import { View } from "react-native";
import Clock from "lucide-react-native/icons/clock";
import { Body } from "./typography";
import { HintLabel } from "./info-hint";
import { useMobileTheme } from "./theme";
import { metrics, opacity, space } from "./tokens";
import { useReducedMotionPreference } from "./use-reduced-motion";

/** Boxed value trigger shared by the time pickers: label above, value inside, same box as SelectField. */
export function TimeFieldTrigger({ label, value, hint, disabled, onPress }: {
  label: string; hint?: string; value: string; disabled?: boolean; onPress: () => void;
}) {
  const { colors, uiStyles } = useMobileTheme();
  const reducedMotion = useReducedMotionPreference();
  return (
    <View style={uiStyles.field}>
      <HintLabel label={label} help={hint} />
      {/* Keep a growing button value: Input/TimePicker would add text editing or another picker owner. */}
      <InputGroup isDisabled={disabled}>
      <AnimatedPressable
        pressScale={1}
        pressOpacity={reducedMotion ? 1 : opacity.pressed}
        className="min-h-12 w-full rounded-lg border border-input bg-background"
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        accessibilityState={{ disabled: !!disabled }}
        aria-disabled={!!disabled}
        disabled={disabled}
        onPress={onPress}
        style={[uiStyles.input, disabled && { opacity: opacity.disabled }, {
          minHeight: metrics.touchTarget,
          flexDirection: "row", alignItems: "center", gap: space.sm,
        }]}
      >
        <Body selectable={false} style={uiStyles.grow}>{value}</Body>
        <Clock size={16} color={colors.muted} />
      </AnimatedPressable>
      </InputGroup>
    </View>
  );
}
