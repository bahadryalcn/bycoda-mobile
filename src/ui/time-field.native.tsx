import { useEffect, useState } from "react";
import { Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useCopy } from "./copy";
import { Button } from "./buttons";
import { TimeFieldTrigger } from "./time-field-trigger";
import { Sheet } from "./dialogs";
import { Row } from "./layout";
import { useMobileTheme } from "./theme";
import { selectedWallTime, wallTimePickerDate, type TimeFieldProps } from "./time-field-model";

/** Native time selection retains HH:mm host-local fields without conversion. */
export function TimeField({ label, value, onChange, disabled }: TimeFieldProps) {
  const copy = useCopy();
  const { mode, colors } = useMobileTheme();
  const [draft, setDraft] = useState<Date | null>(null);
  useEffect(() => { if (disabled) setDraft(null); }, [disabled]);
  const picker = draft !== null && !disabled ? <DateTimePicker
    accessibilityLabel={label} value={draft} mode="time" is24Hour timeZoneName="UTC"
    display={Platform.OS === "ios" ? "spinner" : "default"}
    themeVariant={mode} textColor={colors.text} accentColor={colors.accent}
    positiveButton={{ label: copy("Uygula", "Apply") }} negativeButton={{ label: copy("Vazgeç", "Cancel") }}
    onChange={(event, selected) => {
      const time = selectedWallTime(event.type, selected);
      if (Platform.OS === "android") {
        setDraft(null);
        if (!disabled && time !== undefined) onChange(time);
      } else if (time !== undefined && selected) setDraft(selected);
    }} /> : null;
  return <>
    <TimeFieldTrigger label={label} value={value} disabled={disabled}
      onPress={() => setDraft(wallTimePickerDate(value))} />
    {Platform.OS === "android" ? picker : draft !== null && !disabled ?
      <Sheet visible title={label} size="compact" onClose={() => setDraft(null)}
        footer={<Row style={{ justifyContent: "space-between" }}>
          <Button label={copy("Vazgeç", "Cancel")} tone="quiet" onPress={() => setDraft(null)} />
          <Button label={copy("Uygula", "Apply")} tone="primary" onPress={() => {
            const time = selectedWallTime("set", draft);
            if (!disabled && time !== undefined) onChange(time);
            setDraft(null);
          }} />
        </Row>}>
        {picker}
      </Sheet> : null}
  </>;
}
