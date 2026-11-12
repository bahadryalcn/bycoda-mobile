import type { ComponentType } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { PressableCard } from "@/ui/primitives";
import { metrics, space } from "@/ui/tokens";
import { useMobileTheme } from "@/ui/theme";

/** Underlined tab bar: one slim row, 48dp hit areas, the active tab marked by an accent rule. */
export function ProjectSegments<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; icon?: ComponentType<{ size?: number; color?: string }> }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  const { colors, uiStyles } = useMobileTheme();
  // Large text may wrap a tab label onto a second line instead of truncating it.
  const { fontScale } = useWindowDimensions();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label}
      style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.separator }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <PressableCard
            key={option.value}
            role="tab"
            label={option.label}
            selected={active}
            disabled={disabled}
            onPress={() => { if (!active) onChange(option.value); }}
            style={{ flex: 1, minWidth: 0, minHeight: metrics.touchTarget, alignItems: "center", justifyContent: "center", gap: space.xxs,
              paddingVertical: space.xs, paddingHorizontal: space.xxs, marginHorizontal: 0, marginBottom: -1,
              borderWidth: 0, backgroundColor: "transparent",
              borderBottomWidth: 2, borderBottomColor: active ? colors.accent : "transparent" }}
          >
            {option.icon ? <option.icon size={18} color={active ? colors.accent : colors.muted} /> : null}
            <Text numberOfLines={fontScale > 1 ? 2 : 1} style={[uiStyles.label, { textAlign: "center", color: active ? colors.text : colors.muted, fontWeight: "600" }]}>
              {option.label}
            </Text>
          </PressableCard>
        );
      })}
    </View>
  );
}
