import { Tabs } from "panelui-native/components/tabs";
import { useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { useMobileTheme } from "./theme";
import type { SelectionOption } from "./selection-model";
import { Body } from "./typography";
import { fontSize, hitSlopFor, metrics, space } from "./tokens";
import { useReducedMotionPreference } from "./use-reduced-motion";
import { SelectField } from "./select-field";

/** Direct choices use PanelUI tabs; constrained labels use our controlled selector. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled,
  label,
  compact = true,
  hideLabel = false,
}: {
  value: T;
  options: readonly SelectionOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  label: string;
  compact?: boolean;
  hideLabel?: boolean;
}) {
  const { colors } = useMobileTheme();
  const reducedMotion = useReducedMotionPreference();
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const [width, setWidth] = useState<number>();
  const [overflowKey, setOverflowKey] = useState("");
  // Budget space for readable labels as well as the minimum touch target.
  // Measure this region: a sheet/panel may be narrower than the window.
  const segmentWidth = (metrics.touchTarget + space.lg * 2) * Math.max(1, fontScale);
  const layoutKey = JSON.stringify([
    width ?? windowWidth, fontScale, compact, options.map((option) => option.label),
  ]);
  const showSelector = options.length > 3 || overflowKey === layoutKey ||
    options.length * segmentWidth + space.xs > (width ?? windowWidth);
  const change = (next: string) => {
    const option = options.find((item) => item.value === next);
    if (!disabled && option && !option.disabled) onChange(option.value);
  };
  return <View style={{ minWidth: 0, alignSelf: "stretch" }} onLayout={(event) => {
    const next = event.nativeEvent.layout.width;
    if (next > 0) setWidth((current) => current === next ? current : next);
  }}>
    {showSelector ? (
      <SelectField
        label={label}
        hideLabel={hideLabel}
        value={value}
        options={options}
        onChange={change}
        disabled={disabled}
        compact={compact}
      />
    ) : (
    <Tabs
      defaultValue={value}
      value={value}
      onValueChange={change}
      animation={reducedMotion ? "disable-all" : undefined}
      variant="segmented"
      size={compact ? "sm" : "md"}
    >
      <Tabs.List
        accessibilityLabel={label}
        className="min-w-0 overflow-hidden rounded-control bg-fill p-ui-xxs"
      >
        {options.map((option) => (
          <Tabs.Trigger
            key={option.value}
            value={option.value}
            disabled={disabled || option.disabled}
            {...{ hitSlop: hitSlopFor(metrics.controlHeight) }}
            className="min-h-control min-w-touch flex-1 basis-0 shrink rounded-control bg-transparent border-0 shadow-none px-ui-xs"
          >
            <Body
              selectable={false}
              onLayout={(event) => {
                // Also catches unusually long translations and browser text zoom.
                // Keep the label readable rather than forcing a very tall tab row.
                if (event.nativeEvent.layout.height > metrics.touchTarget) setOverflowKey(layoutKey);
              }}
              style={{
                fontSize: compact ? fontSize.small : fontSize.control,
                fontWeight: value === option.value ? "700" : "500",
                color: value === option.value ? colors.text : colors.muted,
                textAlign: "center",
                minWidth: 0,
                flexShrink: 1,
                alignSelf: "stretch",
                maxWidth: "100%",
              }}
            >
              {option.label}
            </Body>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs>
    )}
  </View>;
}
