import type { ComponentType } from "react";
import { Text, useWindowDimensions } from "react-native";
import { Tabs } from "panelui-native/components/tabs";
import { useMobileTheme } from "@/ui/theme";
import { useReducedMotionPreference } from "@/ui/use-reduced-motion";

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
  const reducedMotion = useReducedMotionPreference();
  // Four short labels fit a phone row; scroll only when large text needs the room.
  const scrollable = useWindowDimensions().fontScale > 1.15;
  return (
    <Tabs defaultValue={value} value={value} variant="underline" animation={reducedMotion ? "disable-all" : undefined}
      onValueChange={(next) => { const option = options.find((item) => item.value === next); if (!disabled && option && option.value !== value) onChange(option.value); }}>
    <Tabs.List accessibilityLabel={label} scrollable={scrollable}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Tabs.Trigger
            key={option.value}
            value={option.value}
            disabled={disabled}
            className="min-h-12 min-w-12 shrink"
            icon={option.icon ? <option.icon size={18} color={active ? colors.accent : colors.muted} /> : undefined}
          >
            <Text numberOfLines={1} style={[uiStyles.label, { textAlign: "center", color: active ? colors.text : colors.muted, fontWeight: "600" }]}>
              {option.label}
            </Text>
          </Tabs.Trigger>
        );
      })}
    </Tabs.List>
    </Tabs>
  );
}
