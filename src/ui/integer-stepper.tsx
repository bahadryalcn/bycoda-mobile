import { useCallback, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Minus from "lucide-react-native/icons/minus";
import Plus from "lucide-react-native/icons/plus";
import { AnimatedPressable } from "panelui-native/primitives/animated-pressable";
import { useLocale } from "@/i18n";
import { useCopy } from "./copy";
import { HintLabel } from "./info-hint";
import { useMobileTheme } from "./theme";
import { metrics, opacity, radii, space } from "./tokens";
import { Body } from "./typography";

type IntegerStepperProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  onValueChange: (value: number) => void;
  disabled?: boolean;
};

/** A bounded integer control with a readable center and no editable input. */
export function IntegerStepper({ label, value, min, max, onValueChange, disabled }: IntegerStepperProps) {
  const copy = useCopy();
  const locale = useLocale();
  const { colors, uiStyles } = useMobileTheme();
  const latest = useRef({ value, min, max, onValueChange, disabled });
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);
  latest.current = { value, min, max, onValueChange, disabled };
  const stop = useCallback(() => {
    if (repeat.current === null) return;
    clearInterval(repeat.current);
    repeat.current = null;
  }, []);
  // The held action must end when the control is disabled or removed.
  useEffect(() => {
    if (disabled) stop();
    return stop;
  }, [disabled, stop]);
  const change = (direction: -1 | 1) => {
    const state = latest.current;
    if (state.disabled) return false;
    const next = Math.min(state.max, Math.max(state.min, state.value + direction));
    if (state.value === next) return false;
    state.value = next;
    state.onValueChange(next);
    return direction > 0 ? next < state.max : next > state.min;
  };
  const hold = (direction: -1 | 1) => {
    stop();
    if (change(direction)) repeat.current = setInterval(() => {
      if (!change(direction)) stop();
    }, 90);
  };
  const valueText = new Intl.NumberFormat(locale).format(value);
  const button = (direction: -1 | 1) => {
    const Icon = direction < 0 ? Minus : Plus;
    const off = !!disabled || (direction < 0 ? value <= min : value >= max);
    const action = direction < 0
      ? copy("{p0} azalt", "Decrease {p0}", { p0: label })
      : copy("{p0} artır", "Increase {p0}", { p0: label });
    return (
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={action}
        accessibilityState={{ disabled: off }}
        disabled={off}
        onPress={() => { change(direction); }}
        onLongPress={() => hold(direction)}
        onPressOut={stop}
        pressOpacity={opacity.pressed}
        pressScale={1}
        style={{
          minWidth: metrics.touchTarget, minHeight: metrics.touchTarget, alignItems: "center",
          justifyContent: "center", opacity: off ? opacity.disabled : 1,
        }}
      >
        <Icon size={20} strokeWidth={2.2} color={colors.text} />
      </AnimatedPressable>
    );
  };
  return (
    <View style={uiStyles.field}>
      <HintLabel label={label} />
      <View style={{
        flexDirection: "row", alignItems: "stretch", minHeight: metrics.touchTarget,
        borderRadius: radii.control, borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border, backgroundColor: colors.fill,
      }}>
        {button(-1)}
        <View style={{
          flex: 1, minWidth: 0, justifyContent: "center",
          paddingVertical: space.sm, paddingHorizontal: space.xs,
        }}>
          <Body
            selectable={false}
            accessibilityLabel={`${label}: ${valueText}`}
            style={{ textAlign: "center", fontVariant: ["tabular-nums"] }}
          >{valueText}</Body>
        </View>
        {button(1)}
      </View>
    </View>
  );
}
