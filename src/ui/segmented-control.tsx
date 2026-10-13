import { Text, type LayoutChangeEvent, type PressableStateCallbackType } from "react-native";
import { Tabs, TabsList, TabsTrigger } from "./gluestack/tabs";
import { colors, metrics, opacity, radii, space } from "./tokens";
import { uiStyles } from "./styles";
import type { SelectionOption } from "./selection-model";
import { useEffect, useState } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { motionTiming } from "./motion";

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled,
  label,
  compact = true,
}: {
  value: T;
  options: readonly SelectionOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  label: string;
  compact?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const segmentWidth = options.length ? (width - 4 - (options.length - 1) * 2) / options.length : 0;
  const offset = useSharedValue(0);
  useEffect(() => {
    offset.value = withTiming(Math.max(0, selectedIndex) * (segmentWidth + 2), motionTiming);
  }, [selectedIndex, segmentWidth, offset]);
  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  return (
    <Tabs
      value={value}
      onValueChange={(next: string) => onChange(next as T)}
      disabled={disabled}
      className="gap-0"
    >
      <TabsList
        fitted
        className="p-0 rounded-control bg-panel"
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
        accessibilityRole="tablist"
        accessibilityLabel={label}
        style={{
          flexDirection: "row",
          padding: 2,
          gap: 2,
          backgroundColor: colors.panel,
          borderRadius: radii.control,
          borderWidth: 0,
        }}
      >
        {width > 0 && selectedIndex >= 0 ? (
          <Animated.View
            pointerEvents="none"
            accessible={false}
            style={[
              {
                position: "absolute",
                top: 2,
                bottom: 2,
                start: 2,
                width: segmentWidth,
                borderRadius: radii.control - 2,
                backgroundColor: colors.raised,
                borderWidth: 0,
              },
              indicator,
            ]}
          />
        ) : null}
        {options.map((option) => (
          <TabsTrigger
            value={option.value}
            className="min-h-0 min-w-0 p-0"
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: value === option.value, disabled: !!disabled }}
            aria-selected={value === option.value}
            disabled={disabled}
            hitSlop={{ top: compact ? 7 : 5, bottom: compact ? 7 : 5, left: 0, right: 0 }}
            style={({ pressed }: PressableStateCallbackType) => ({
              flex: 1,
              minWidth: 0,
              minHeight: compact ? metrics.compactControlHeight : metrics.controlHeight,
              paddingHorizontal: space.sm,
              paddingVertical: compact ? 4 : 6,
              justifyContent: "center",
              alignItems: "center",
              borderRadius: radii.control - 2,
              borderWidth: 1,
              borderColor: "transparent",
              backgroundColor: "transparent",
              opacity: disabled ? opacity.disabled : pressed ? opacity.pressed : 1,
            })}
          >
            <Text
              style={[
                uiStyles.buttonLabel,
                {
                  textAlign: "center",
                  color: value === option.value ? colors.accent : colors.muted,
                },
              ]}
            >
              {option.label}
            </Text>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
