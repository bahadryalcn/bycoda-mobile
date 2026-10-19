import { Tabs } from "panelui-native/components/tabs";
import { useMobileTheme } from "./theme";
import type { SelectionOption } from "./selection-model";
import { Body } from "./typography";
import { colors, fontSize } from "./tokens";

/** PanelUI owns selected-indicator motion, keyboard focus and tab semantics. */
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
  useMobileTheme();
  return (
    <Tabs
      defaultValue={value}
      value={value}
      onValueChange={(next) => onChange(next as T)}
      variant="segmented"
      size={compact ? "sm" : "md"}
    >
      <Tabs.List accessibilityLabel={label} className="rounded-control bg-fill p-0.5">
        {options.map((option) => (
          <Tabs.Trigger
            key={option.value}
            value={option.value}
            disabled={disabled}
            className="min-h-control min-w-touch flex-1 rounded-control px-ui-sm"
          >
            <Body selectable={false} style={{
              fontSize: compact ? fontSize.small : fontSize.control,
              fontWeight: value === option.value ? "600" : "500",
              color: value === option.value ? colors.text : colors.muted,
              textAlign: "center",
            }}>{option.label}</Body>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
