import { useRef, useState } from "react";
import { View, type GestureResponderEvent } from "react-native";
import { Body } from "./typography";
import { useMobileTheme } from "./theme";
import { metrics, radii, space } from "./tokens";
import { barRatio, stepAt } from "./level-slider-model";

export type LevelOption<T extends string> = { value: T; label: string };

/**
 * One value on an ordered named scale (Low ... Max) shown as a row of rising bars, one per level,
 * like the desktop reasoning control. Bars up to the chosen level are filled; tap or drag to
 * choose. The control is discrete by construction (it never rests between levels) and `onChange`
 * fires once, when the finger lifts, so a remote setting is written a single time. Use it for
 * four or more steps that really are ordered; unordered or two/three-way choices belong to
 * SegmentedControl, ToggleField or SelectField. `lowLabel` and `highLabel` name the ends.
 */
export function LevelSlider<T extends string>({ label, value, options, onChange, disabled, lowLabel, highLabel }: {
  label: string;
  value: T;
  options: readonly LevelOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  lowLabel: string;
  highLabel: string;
}) {
  const { colors, uiStyles } = useMobileTheme();
  const width = useRef(0);
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  // The step under the finger; cleared when the gesture ends so the committed value shows again.
  const [dragging, setDragging] = useState<number | undefined>(undefined);
  const latest = useRef<number | undefined>(undefined);
  if (options.length < 2) return null;
  const count = options.length;
  const shown = dragging ?? index;
  const at = (event: GestureResponderEvent) => stepAt(event.nativeEvent.locationX, width.current, count);
  const move = (step: number) => { latest.current = step; setDragging(step); };
  const commit = (step: number) => {
    latest.current = undefined;
    setDragging(undefined);
    const next = options[step];
    if (next && next.value !== value) onChange(next.value);
  };
  const nudge = (delta: number) => commit(Math.min(count - 1, Math.max(0, index + delta)));
  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: space.md }}>
        <Body style={uiStyles.fieldLabel}>{label}</Body>
        <Body style={{ color: colors.accent, fontWeight: "600" }}>{options[shown]!.label}</Body>
      </View>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: count - 1, now: shown, text: options[shown]!.label }}
        accessibilityState={{ disabled: !!disabled }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => {
          if (disabled) return;
          nudge(event.nativeEvent.actionName === "increment" ? 1 : -1);
        }}
        onLayout={(event) => { width.current = event.nativeEvent.layout.width; }}
        onStartShouldSetResponder={() => !disabled}
        onMoveShouldSetResponder={() => !disabled}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(event) => move(at(event))}
        onResponderMove={(event) => move(at(event))}
        onResponderRelease={(event) => commit(at(event))}
        onResponderTerminate={() => commit(latest.current ?? index)}
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: space.sm,
          height: metrics.touchTarget,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {options.map((option, i) => (
          <View
            key={option.value}
            pointerEvents="none"
            style={{
              flex: 1,
              height: `${Math.round(barRatio(i, count) * 100)}%`,
              borderRadius: radii.badge,
              backgroundColor: i <= shown ? colors.accent : colors.border,
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
        <Body muted style={uiStyles.caption}>{lowLabel}</Body>
        <Body muted style={uiStyles.caption}>{highLabel}</Body>
      </View>
    </View>
  );
}
