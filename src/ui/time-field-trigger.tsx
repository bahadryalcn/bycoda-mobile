import { Pressable } from "react-native";
import { View } from "react-native";
import Clock from "lucide-react-native/icons/clock";
import { Body } from "./typography";
import { HintLabel } from "./info-hint";
import { useMobileTheme } from "./theme";
import { opacity, space } from "./tokens";

/** Boxed value trigger shared by the time pickers: label above, value inside, same box as SelectField. */
export function TimeFieldTrigger({ label, value, hint, disabled, onPress }: {
  label: string; hint?: string; value: string; disabled?: boolean; onPress: () => void;
}) {
  const { colors, uiStyles } = useMobileTheme();
  return (
    <View style={uiStyles.field}>
      <HintLabel label={label} help={hint} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        accessibilityState={{ disabled: !!disabled }}
        aria-disabled={!!disabled}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [uiStyles.input, {
          flexDirection: "row", alignItems: "center", gap: space.sm,
          opacity: disabled ? opacity.disabled : pressed ? opacity.pressed : 1,
        }]}
      >
        <Body selectable={false} style={uiStyles.grow}>{value}</Body>
        <Clock size={16} color={colors.muted} />
      </Pressable>
    </View>
  );
}
