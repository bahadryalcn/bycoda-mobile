import { useState } from "react";
import { View } from "react-native";
import { Slider } from "panelui-native/components/slider";
import { Body } from "./typography";
import { useMobileTheme } from "./theme";
import { metrics, space } from "./tokens";
import { snapSliderValue } from "./slider-field-model";

export type SliderFieldProps = {
  /** Visible name; also the accessible name of the thumb. */
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Fires once when the finger lifts or an accessibility action steps the value: the place to persist. */
  onCommit: (value: number) => void;
  /** Fires while dragging; use only for cheap local previews, never for storage or remote writes. */
  onChange?: (value: number) => void;
  /** Visible and spoken value text, for example "115%". Defaults to the number. */
  formatValue?: (value: number) => string;
  disabled?: boolean;
  /** Names for the two ends of the scale, shown under the track. */
  lowLabel?: string;
  highLabel?: string;
};

/**
 * One number on a continuous or finely stepped range (text scale, line spacing). Use it when the
 * choices are many and ordered; two or three named choices belong to SegmentedControl, four to
 * six named steps to LevelSlider. It wraps PanelUI Slider: the label row is our shared field
 * label with the live value, the track keeps a 48dp touch row, and the thumb is an adjustable
 * element with min/max/value text for VoiceOver and TalkBack. The shown value follows the finger
 * while dragging and `onCommit` fires once at the end, so a persisted preference is written a
 * single time per gesture.
 */
export function SliderField({
  label, value, min, max, step, onCommit, onChange, formatValue, disabled, lowLabel, highLabel,
}: SliderFieldProps) {
  const { colors, uiStyles } = useMobileTheme();
  // The value under the finger; cleared on commit so the owner's value shows again.
  const [draft, setDraft] = useState<number | undefined>(undefined);
  const committed = snapSliderValue(value, min, max, step);
  const shown = draft ?? committed;
  const print = formatValue ?? ((n: number) => String(n));
  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: space.md }}>
        <Body style={[uiStyles.fieldLabel, { flexShrink: 1 }]}>{label}</Body>
        <Body style={{ color: colors.accent, fontWeight: "600" }}>{print(shown)}</Body>
      </View>
      <View style={{ minHeight: metrics.touchTarget, justifyContent: "center" }}>
        {/* Slider draws its own caption row; hidden here because the row above owns the visible label and value, while `label` still names the thumb. */}
        <Slider
          label={label}
          headerClassName="hidden"
          value={shown}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          formatValue={print}
          onValueChange={(next) => {
            const snapped = snapSliderValue(next, min, max, step);
            setDraft(snapped);
            onChange?.(snapped);
          }}
          onValueCommit={(next) => {
            setDraft(undefined);
            const snapped = snapSliderValue(next, min, max, step);
            if (snapped !== committed) onCommit(snapped);
          }}
        />
      </View>
      {lowLabel || highLabel ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
          <Body muted style={uiStyles.caption}>{lowLabel ?? ""}</Body>
          <Body muted style={uiStyles.caption}>{highLabel ?? ""}</Body>
        </View>
      ) : null}
    </View>
  );
}
